import { Api } from "./api.js";

// Start the server
async function main() {
  const api = new Api();
  await api.listen(8080);
}

// Run the server
main();
