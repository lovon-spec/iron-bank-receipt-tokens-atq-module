# Iron Bank receipt-token ATQ module

One category across Ethereum (`1`) and Avalanche (`43114`): Iron Bank lending-market ERC-20 receipt/accounting token contracts, including historical and delisted markets. It does not tag their underlying assets, controllers, price oracles or unrelated Cream markets. Contract existence is not a claim of enabled lending, balances, solvency or redemption availability.

## Data and protocol

[Messari's decentralized-network catalog](https://github.com/messari/subgraphs/blob/2711ac91ef119f321f65b339e10a57f9aa74f9d8/deployment/deployment.json) identifies these specific Iron Bank subgraphs:

| Chain | Subgraph ID | Deployment |
| --- | --- | --- |
| Ethereum | `5YoxED3bbWV9byvn3x3S3ebZ3idrQmQmsJhL5LMyY26v` | `QmYDS1MwYNjciXpJVtuuhb9KoPd6CCKLVYnhW3ofzm6yt1` |
| Avalanche | `9YiJM9oHy25estSJjB1Z71Hdz5C814R3vDoS2ezpN27C` | `QmfHn9JVnMMLCxiEhePnVVGHEvBBbW2e98AegKJXKnScTS` |

The module queries each deployment directly. All market and token relations are retrieved with ascending ID pagination at one indexed block hash. Output addresses come from `outputToken.id`, which must equal `Market.id`; the queried protocol identity must match the configured controller. Query errors, malformed records, inconsistent snapshots and unresolved naming conflicts fail the entire call. The caller's Graph API key is used only as a Bearer header.

[Iron Bank's protocol repository](https://github.com/ibdotxyz/compound-protocol/blob/6e1d3d350147d53834ca3cd6e9a068592f6e2654/README.md) describes the Compound-derived lending protocol and its Ethereum/Avalanche implementations. [The official deployment repository](https://github.com/ibdotxyz/ib-deployment/tree/4f92e941615b42c62b04539c30caafebb8454156/deployments/avalanche) records Avalanche contracts.

Two Ethereum source records, `0xab10586c918612ba440482db77549d26b7abf8f7` and `0xdfff11dfe6436e42a17b86e7f419ac8292990393`, are excluded because their onchain `comptroller()` points to Cream's `0x3d5bc3c8d13dcb8bf317092d84783c2697ae9258`, not Iron Bank's controller. The exclusion and its reason are explicitly commented in the entrypoint. No activity, listing, balance or legacy-name filter is used.

Labels describe the receipt role under Iron Bank. Notes retain indexed historical Yearn/Cream identities as historical, identify the underlying and its project, and distinguish address-bound legacy/rebranded assets. Distinct receipt instances for the same asset receive a short queried contract identifier in their labels; they are never merged. Underlying assets are not output entries. The website field refers to the official protocol's relevant public project page, not a promise of a functioning borrowing UI.

## Run

```sh
yarn install --frozen-lockfile
yarn build
yarn test
```

Import `dist/main.mjs` and call `await returnTags("1", graphApiKey)` or `await returnTags("43114", graphApiKey)`. All retrieval and formatting logic is in `src/main.mts`; the sole exported async function accepts exactly two arguments. Results contain the five Address Tags fields and chain-qualified `eip155` addresses. Public labels are plain text, unique per network and at most 50 characters.
