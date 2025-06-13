.DEFAULT_GOAL := build

.PHONY: build clean fmt fmt_check

build:
	npm run build

clean:
	npm run clean

push:
	npm run docker:build
	npm run docker:tag
	npm run docker:push

start:
	npm run start

fmt:
	npm run fmt

fmt_check:
	npm run fmt:check
