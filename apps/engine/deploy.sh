# web
docker buildx build --platform linux/amd64 -t grep3-web .
docker tag grep3-web registry.heroku.com/$HEROKU_APP/web
docker push registry.heroku.com/$HEROKU_APP/web

# worker
docker buildx build --platform linux/amd64 -t grep3-worker -f Dockerfile.worker .
docker tag grep3-worker registry.heroku.com/$HEROKU_APP/worker
docker push registry.heroku.com/$HEROKU_APP/worker

# scheduler
docker buildx build --platform linux/amd64 -t grep3-scheduler -f Dockerfile.scheduler .
docker tag grep3-scheduler registry.heroku.com/$HEROKU_APP/scheduler
docker push registry.heroku.com/$HEROKU_APP/scheduler

# release
heroku container:release --app $HEROKU_APP web worker scheduler