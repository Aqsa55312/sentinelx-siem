FROM golang:1.23-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /sentinelx-api .

FROM alpine:3.20
COPY --from=build /sentinelx-api /sentinelx-api
EXPOSE 8080
ENTRYPOINT ["/sentinelx-api"]
