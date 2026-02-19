import os
import subprocess
import tempfile
import gzip
import shutil
import logging
import argparse
from datetime import datetime
from urllib.parse import urlparse
from google.cloud import storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")


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

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    base_name = f"backup-{timestamp}.sql"
    upload_name = base_name + (".gz" if compress else "")

    # Create a temporary file for the dump
    tmp_sql = tempfile.NamedTemporaryFile(delete=False, suffix=".sql")
    tmp_sql.close()

    try:
        logging.info("Running pg_dump")
        # Use --dbname to accept a full DATABASE_URL/URI
        cmd = ["pg_dump", "--dbname", db_url, "-f", tmp_sql.name]
        subprocess.run(cmd, check=True)

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


def main():
    parser = argparse.ArgumentParser(description="Create a PostgreSQL backup and upload to GCS")
    parser.add_argument("--db-url", help="Database URL (overrides DATABASE_URL env)")
    parser.add_argument("--bucket", help="GCS bucket name (overrides BUCKET_NAME env)")
    parser.add_argument("--prefix", help="Optional GCS prefix/path to store backups", default=None)
    parser.add_argument("--no-compress", dest="compress", action="store_false", help="Do not gzip the dump")

    args = parser.parse_args()

    try:
        result = backup_db(db_url=args.db_url, bucket_name=args.bucket, backup_prefix=args.prefix, compress=args.compress)
        logging.info("Backup successful: gs://%s/%s", result['bucket'], result['blob'])
    except Exception as e:
        logging.error("Backup failed: %s", e)
        raise


if __name__ == "__main__":
    main()
