FROM python:3.11

RUN apt-get update && apt-get install -y postgresql-client

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py .

EXPOSE 8080

CMD ["python", "app.py"]
    