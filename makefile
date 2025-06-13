.DEFAULT_GOAL := gi

.PHONY: gi

gi:
	rm -rf mcp-server.txt && gitingest -o mcp-server.txt -e "llm/*" -e "**/.git/**" -e "**/node_modules/**" -e "**/target/**" -e "**/.anchor/**" -e "**/cdk.out/**" -e "*.github/*" -e "*.json*" -e "**/dist/**"