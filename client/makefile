.DEFAULT_GOAL := build

.PHONY: build clean fmt fmt_check

build:
	npm run build

clean:
	npm run clean

local: build
	npm run local

prod: build
	npm run prod

fmt:
	npm run fmt

fmt_check:
	npm run fmt:check
