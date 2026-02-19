import os
import subprocess
import tempfile
import gzip
import shutil
import logging
from datetime import datetime, timezone
from google.cloud import storage
from flask import Flask, jsonify
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")

# Load environment variables from .env if present
load_dotenv()


def _validate_env(db_url, bucket_name):
    if not db_url:
        raise ValueError("DATABASE_URL is not set")
    if not bucket_name:
        raise ValueError("BUCKET_NAME is not set")


def _safe_blob_name(prefix, name):
    if not prefix:
        return name
    return f"{prefix.rstrip('/')}/{name.lstrip('/')}"


def backup_db(db_url=None, bucket_name=None, backup_prefix=None, compress=True):
    """Create a PostgreSQL dump and upload it to GCS.

    Args:
        db_url (str): Database URL/URI. If None, read from env `DATABASE_URL`.
        bucket_name (str): GCS bucket name. If None, read from env `BUCKET_NAME`.
        backup_prefix (str): Optional prefix/path inside the bucket.
        compress (bool): Whether to gzip the SQL output before upload.

    Returns:
        dict: info about the uploaded backup (bucket, blob_name, size_bytes).
    """
    db_url = db_url or os.environ.get("DATABASE_URL")
    bucket_name = bucket_name or os.environ.get("BUCKET_NAME")
    backup_prefix = backup_prefix or os.environ.get("BACKUP_PREFIX", "")

    _validate_env(db_url, bucket_name)

    # Use timezone-aware UTC datetime
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    base_name = f"backup-{timestamp}.sql"
    upload_name = base_name + (".gz" if compress else "")

    # Create a temporary file for the dump
    tmp_sql = tempfile.NamedTemporaryFile(delete=False, suffix=".sql")
    tmp_sql.close()

    try:
        logging.info("Running pg_dump")
        # Allow overriding pg_dump executable path via env var (helpful on Windows)
        pg_dump_cmd = os.environ.get("PG_DUMP_PATH", "pg_dump")
        # Use --dbname to accept a full DATABASE_URL/URI
        cmd = [pg_dump_cmd, "--dbname", db_url, "-f", tmp_sql.name]
        try:
            subprocess.run(cmd, check=True)
        except FileNotFoundError as fnf:
            logging.error("pg_dump executable not found: %s", pg_dump_cmd)
            logging.error("On Windows install PostgreSQL client or set PG_DUMP_PATH to the pg_dump executable path.")
            raise RuntimeError(f"pg_dump not found: {pg_dump_cmd}") from fnf

        upload_path = tmp_sql.name
        if compress:
            gz_path = tempfile.NamedTemporaryFile(delete=False, suffix=".sql.gz")
            gz_path.close()
            logging.info("Compressing dump to %s", gz_path.name)
            with open(tmp_sql.name, "rb") as f_in, gzip.open(gz_path.name, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
            upload_path = gz_path.name

        # Upload to GCS
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob_name = _safe_blob_name(backup_prefix, upload_name)
        blob = bucket.blob(blob_name)

        logging.info("Uploading %s to gs://%s/%s", upload_path, bucket_name, blob_name)
        blob.upload_from_filename(upload_path)

        size = os.path.getsize(upload_path)
        logging.info("Upload complete (%d bytes)", size)

        return {"bucket": bucket_name, "blob": blob_name, "size": size}

    except subprocess.CalledProcessError as e:
        logging.exception("pg_dump failed: %s", e)
        raise
    finally:
        # Cleanup temporary files
        try:
            if os.path.exists(tmp_sql.name):
                os.remove(tmp_sql.name)
        except Exception:
            logging.debug("Failed to remove temp sql file", exc_info=True)

        if compress:
            try:
                if 'gz_path' in locals() and os.path.exists(gz_path.name):
                    os.remove(gz_path.name)
            except Exception:
                logging.debug("Failed to remove temp gz file", exc_info=True)


def _env_bool(name, default=True):
    v = os.environ.get(name)
    if v is None:
        return default
    return str(v).lower() not in ("0", "false", "no", "n")


def main():
    db_url = os.environ.get("DATABASE_URL")
    bucket = os.environ.get("BUCKET_NAME")
    prefix = os.environ.get("BACKUP_PREFIX")
    compress = _env_bool("BACKUP_COMPRESS", True)

    try:
        result = backup_db(db_url=db_url, bucket_name=bucket, backup_prefix=prefix, compress=compress)
        logging.info("Backup successful: gs://%s/%s", result["bucket"], result["blob"])
    except Exception as e:
        logging.error("Backup failed: %s", e)
        raise


def create_app():
    app = Flask(__name__)

    @app.route("/", methods=["GET"])
    def health():
        return "ok", 200

    @app.route("/backup", methods=["POST", "GET"])
    def trigger_backup():
        # Trigger a backup using environment variables only.
        try:
            result = backup_db()
            return jsonify(result), 200
        except Exception as e:
            logging.exception("Backup failed via HTTP: %s", e)
            return jsonify({"error": str(e)}), 500

    return app


if __name__ == "__main__":
    port_env = os.environ.get("PORT")
    if port_env:
        app = create_app()
        app.run(host="0.0.0.0", port=int(port_env))
    else:
        main()
