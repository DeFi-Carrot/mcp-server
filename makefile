.DEFAULT_GOAL := gi

.PHONY: gi

gi:
	rm -rf llm/mcp-server.txt && gitingest -o llm/mcp-server.txt -e "llm/*" -e "**/.git/**" -e "**/node_modules/**" -e "**/target/**" -e "**/.anchor/**" -e "**/cdk.out/**" -e "*.github/*" -e "*.json*" -e "**/dist/**"