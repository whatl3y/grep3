# web
docker buildx build --platform linux/amd64 -t grep3-tornado-api .
docker tag grep3-tornado-api registry.heroku.com/$HEROKU_APP/web
docker push registry.heroku.com/$HEROKU_APP/web

# release
heroku container:release --app $HEROKU_APP web