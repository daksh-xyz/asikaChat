# FastAPI Server Container & Deployment Guide

This document walks through building a Docker image for the FastAPI server, testing it locally, and deploying it to an existing AWS EC2 instance. The API is launched with `uvicorn` and reads configuration via environment variables (see `.env` / `GROQ_API_KEY`).

## 1. Prerequisites
- Docker installed locally and on the EC2 host.
- AWS CLI configured with permissions to use Elastic Container Registry (ECR) and manage the EC2 instance.
- Access to the EC2 instance (SSH or SSM) where two other containers already run.
- GROQ and other API keys ready to be injected as environment variables (`-e KEY=value` or AWS Secrets).
- Only the `server/` folder is sent to Docker/ECR—the `Dockerfile` and `.dockerignore` now live inside `server/`, so the frontend never leaves your machine.

## 2. Build & Test Locally
```bash
# from repo root, but sending only ./server as the build context
docker build -t fastapi-server -f server/Dockerfile server

docker run --rm -it \
  -p 8000:8000 \
  -e GROQ_API_KEY=sk-... \
  fastapi-server
# visit http://localhost:8000/docs
```
If you already generated a Chroma DB under `server/chroma_db`, it will be baked into the image. Otherwise the app auto-builds the DB from `server/data` when it first starts.

## 3. Push to Amazon ECR
1. Create or reuse an ECR repository, e.g. `fastapi-server` in your AWS account/region.
2. Authenticate Docker to ECR:
   ```bash
   aws ecr get-login-password --region <region> \
     | docker login --username AWS --password-stdin <aws_account_id>.dkr.ecr.<region>.amazonaws.com
   ```
3. Tag & push the image:
   ```bash
   docker tag fastapi-server:latest \
     <aws_account_id>.dkr.ecr.<region>.amazonaws.com/fastapi-server:latest
   docker push \
     <aws_account_id>.dkr.ecr.<region>.amazonaws.com/fastapi-server:latest
   ```

## 4. Run on EC2
You can manually add the new container alongside the two existing ones:
```bash
ssh ec2-user@<public-ip>
# once connected
docker pull <aws_account_id>.dkr.ecr.<region>.amazonaws.com/fastapi-server:latest

docker stop fastapi-server || true

docker run -d --restart unless-stopped \
  --name fastapi-server \
  -p 8080:8000 \  # pick a free host port if 80/443 already taken
  -e GROQ_API_KEY=sk-... \
  -e CHROMA_DB_PATH=/data/chroma_db \  # optional volume for persistence
  -v /opt/fastapi-server/data:/data \   # optional host volume
  <aws_account_id>.dkr.ecr.<region>.amazonaws.com/fastapi-server:latest
```
Adjust ports/env vars to fit your setup. Update the EC2 security group and any load balancer rules to expose the chosen host port.

### Optional docker-compose
If the EC2 host already uses Docker Compose for the other containers, add a new service entry:
```yaml
services:
  fastapi-server:
    image: <aws_account_id>.dkr.ecr.<region>.amazonaws.com/fastapi-server:latest
    restart: unless-stopped
    ports:
      - "8080:8000"
    env_file:
      - .env
    volumes:
      - /opt/fastapi-server/data:/data
```
Then run `docker compose up -d fastapi-server`.

## 5. Instance Capacity Notes
A t3.medium (2 vCPU, 4 GB RAM) usually sustains three lightweight FastAPI containers, but this app bundles LangChain, Chroma, Transformers, and ONNXRuntime, so memory and CPU spikes can happen during embedding or model calls. Monitor:
- `docker stats` or CloudWatch metrics for CPU credit depletion.
- Memory usage—if it approaches 4 GB, consider t3.large or enabling `t3.medium Unlimited` to avoid throttling.

## 6. Next Steps
- Store secrets in AWS Systems Manager Parameter Store or Secrets Manager and inject them via task/user-data instead of inline env vars.
- Automate pushes/deploys with CI/CD (GitHub Actions → ECR → EC2).
- Add health checks (`/debug/chroma`, `/docs`) to your load balancer for better monitoring.
