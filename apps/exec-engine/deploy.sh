# web
docker buildx build --platform linux/amd64 -t grep3-exec-engine-web .
docker tag grep3-exec-engine-web registry.heroku.com/$HEROKU_APP/web
docker push registry.heroku.com/$HEROKU_APP/web

# worker
docker buildx build --platform linux/amd64 -t grep3-exec-engine-worker -f Dockerfile.worker .
docker tag grep3-exec-engine-worker registry.heroku.com/$HEROKU_APP/worker
docker push registry.heroku.com/$HEROKU_APP/worker

# scheduler
docker buildx build --platform linux/amd64 -t grep3-exec-engine-scheduler -f Dockerfile.scheduler .
docker tag grep3-exec-engine-scheduler registry.heroku.com/$HEROKU_APP/scheduler
docker push registry.heroku.com/$HEROKU_APP/scheduler

# release
heroku container:release --app $HEROKU_APP web worker scheduler