export default {
  merkletreeApiUrl:
    process.env.MERKLETREE_API_URL || "http://localhost:8002",
  execApiUrl: process.env.EXEC_API_URL || "http://localhost:8080",
  tornadoApiUrl: process.env.TORNADO_API_URL || "http://localhost:8090",
};
