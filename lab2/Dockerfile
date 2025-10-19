FROM python:3.11-slim

WORKDIR /app

# copy dependencies file
COPY server.py test_concurrent.py ./
COPY content ./content

EXPOSE 8080

CMD ["python", "server.py", "content"]