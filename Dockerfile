FROM python:3.10-slim

WORKDIR /app

COPY server.py client.py ./
COPY content ./content

EXPOSE 8080

CMD ["python", "server.py", "content"]
