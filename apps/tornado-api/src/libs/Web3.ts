import assert from "assert";
import Web3 from "web3";
// import Web3WsProvider from "web3-providers-ws";

// const wsProviderOpts = {
//   timeout: 30000, // ms

//   // Useful for credentialed urls, e.g: ws://username:password@localhost:8546
//   // headers: {
//   //   authorization: 'Basic username:password'
//   // },

//   // Useful if requests result are large
//   clientConfig: {
//     maxReceivedFrameSize: 100000000, // bytes - default: 1MiB
//     maxReceivedMessageSize: 100000000, // bytes - default: 8MiB
//   },

//   // Enable auto reconnection
//   reconnect: {
//     auto: true,
//     delay: 5000, // ms
//     maxAttempts: 5,
//     onTimeout: false,
//   },
// };

export interface IWeb3Instances {
  [key: string]: Web3;
}

export default async function AllWeb3Instances(): Promise<IWeb3Instances> {
  const rpcs = [
    // "https://eth.drpc.org",
    "https://eth.blockrazor.xyz",
    // `https://rpc.mevblocker.io/norefunds`,
    // `https://ethereum.publicnode.com`,
    "https://bsc.publicnode.com",
    "https://arbitrum-one.publicnode.com",
  ];

  let webInstaces: any = {};
  for (let _i = 0; _i < rpcs.length; _i++) {
    const web3 = new Web3(rpcs[_i]);
    try {
      const netID = await web3.eth.net.getId();
      webInstaces[netID] = web3;
    } catch (_err) {
      // NOOP for now
    }
  }
  return webInstaces;
}
