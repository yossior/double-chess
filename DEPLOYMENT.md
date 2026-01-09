# Chess Application - Docker Deployment Guide

## Prerequisites
- Docker installed (https://www.docker.com/products/docker-desktop)
- Docker Compose (included with Docker Desktop)
- (Optional) Docker Hub account for pushing images

## Quick Start - Local Docker Deployment

### 1. Setup Environment Variables
```bash
cp .env.example .env
```
Edit `.env` and change the default passwords and secrets:
```env
MONGO_ROOT_PASSWORD=your_secure_password_here
JWT_SECRET=your_secure_jwt_secret_here
GOOGLE_CLIENT_ID=your_google_client_id_here
```

### 2. Build and Run with Docker Compose
```bash
# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

The application will be available at:
- **Frontend + Backend**: http://localhost:5001
- **API**: http://localhost:5001/api
- **Health Check**: http://localhost:5001/health
- **MongoDB**: localhost:27017 (internal only, unless exposed)

### 3. Verify It's Running
```bash
# Check container status
docker-compose ps

# Test health endpoint
curl http://localhost:5001/health
```

## Production Deployment

### Option A: AWS EC2
```bash
# SSH into instance
ssh -i key.pem ec2-user@your-instance-ip

# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker ec2-user

# Clone your repository
git clone your-repo-url
cd chess

# Setup environment and deploy
cp .env.example .env
# Edit .env with production values
docker-compose up -d
```

### Option B: DigitalOcean App Platform
1. Push Docker image to Docker Hub:
```bash
docker build -t yourusername/chess-app .
docker login
docker push yourusername/chess-app
```

2. Create App on DigitalOcean:
- Select "Docker" as source
- Provide Docker Hub image: `yourusername/chess-app`
- Set environment variables from `.env`
- Configure service port: 5001

### Option C: Railway.app (Recommended - Easiest)
1. Push to GitHub
2. Connect Railway to your repo
3. Configure environment variables in Railway dashboard
4. Railway auto-deploys on push

### Option D: Heroku
```bash
# Build and push to Heroku Container Registry
heroku container:login
heroku create your-app-name
heroku container:push web -a your-app-name
heroku container:release web -a your-app-name
heroku config:set NODE_ENV=production -a your-app-name
heroku config:set MONGO_URI=your_mongodb_uri -a your-app-name
# ... set other env vars
```

## Docker Commands Reference

```bash
# Build image
docker build -t chess-app:latest .

# Run container
docker run -d -p 5001:5001 --env-file .env chess-app:latest

# View logs
docker logs -f container_id

# Execute command in container
docker exec -it container_id sh

# Push to Docker Hub
docker tag chess-app:latest yourusername/chess-app:latest
docker push yourusername/chess-app:latest

# Clean up unused resources
docker system prune -a
```

## Troubleshooting

### Container won't start
```bash
docker-compose logs chess-app
docker-compose down --volumes  # Reset volumes
docker-compose up -d
```

### MongoDB connection issues
- Verify `MONGO_URI` environment variable
- Check MongoDB container is healthy: `docker-compose ps`
- Ensure passwords in `.env` are correct

### Port already in use
```bash
# Change port in docker-compose.yml or kill process
lsof -i :5001
kill -9 PID
```

### Frontend not displaying
- Verify frontend build succeeded: `docker logs chess-app | grep "build"`
- Check public folder exists in container: `docker exec chess-app ls -la public/`

## Monitoring & Maintenance

```bash
# View resource usage
docker stats

# Backup MongoDB data
docker exec chess_mongo mongodump --uri="mongodb://user:pass@localhost:27017/chess" --out=/backup

# Update containers
docker-compose pull
docker-compose up -d

# View all images
docker images

# Remove unused images
docker image prune
```

## Security Checklist
- [ ] Change all default passwords in `.env`
- [ ] Generate strong JWT_SECRET: `openssl rand -base64 32`
- [ ] Use HTTPS in production (reverse proxy with Nginx)
- [ ] Restrict MongoDB to internal network only
- [ ] Set `NODE_ENV=production`
- [ ] Use strong MongoDB credentials
- [ ] Enable firewall rules
- [ ] Monitor logs regularly
