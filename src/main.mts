import fetch from "node-fetch";
import type { ContractTag, ITagService } from "atq-types";

const CHAINS: Readonly<Record<string, {deployment: string; controller: string; name: string}>> = {
  "1": {deployment: "QmYDS1MwYNjciXpJVtuuhb9KoPd6CCKLVYnhW3ofzm6yt1", controller: "0xab1c342c7bf5ec5f02adea1c2270670bca144cbb", name: "Ethereum"},
  "43114": {deployment: "QmfHn9JVnMMLCxiEhePnVVGHEvBBbW2e98AegKJXKnScTS", controller: "0x2ee80614ccbc5e28654324a66a396458fa5cd7cc", name: "Avalanche"},
};
const ADDRESS = /^0x[0-9a-fA-F]{40}$/, ZERO = "0x" + "0".repeat(40), PAGE = 1000;
const MARKETS_QUERY = "query Markets($block: Block_height!, $last: ID!) {" +
  " _meta(block: $block) { deployment hasIndexingErrors block { number hash } }" +
  " markets(block: $block, first: 1000, orderBy: id, orderDirection: asc, where: {id_gt: $last}) {" +
  " id inputToken {id name symbol} outputToken {id name symbol} protocol {id} } }";
interface Token {id: unknown; name: unknown; symbol: unknown}
interface Market {id: unknown; inputToken: Token | null; outputToken: Token | null; protocol: {id: unknown} | null}
interface Meta {deployment: string; hasIndexingErrors: boolean; block: {number: number; hash: string | null}}
function address(value: unknown): string {
  if (typeof value !== "string" || !ADDRESS.test(value) || value.toLowerCase() === ZERO)
    throw Error("Invalid indexed Iron Bank address.");
  return value.toLowerCase();
}
function plain(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 300) throw Error("Invalid indexed Iron Bank metadata.");
  const text = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/[`*_\[\]<>\\|]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) throw Error("Empty indexed Iron Bank metadata.");
  return text;
}
function checkMeta(value: unknown, deployment: string, number?: number, hash?: string): Meta {
  const m = value as Meta | null;
  if (!m || m.deployment !== deployment || m.hasIndexingErrors !== false || !Number.isSafeInteger(m.block?.number) || m.block.number <= 0 ||
      (m.block.hash !== null && (typeof m.block.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(m.block.hash))) ||
      (number !== undefined && m.block.number !== number) || (hash !== undefined && m.block.hash !== null && m.block.hash !== hash))
    throw Error("Inconsistent or errored Iron Bank indexing metadata.");
  return m;
}
function identity(chain: string, asset: string, symbol: string, name: string): {symbol: string; name: string; projects: string[]} {
  // Address-bound underlying naming/issuer metadata, never a static output list.
  if (chain === "1" && asset === "0x1456688345527be1f37e9e627da0837d6f08c925")
    return {symbol: "USDP", name: "Unit Protocol USDP", projects: ["Unit Protocol"]};
  if (chain === "1" && asset === "0x853d955acef822db058eb8505911ed77f175b99e")
    return {symbol: "Legacy FRAX", name: "Legacy Frax Dollar (FRAX)", projects: ["Frax Finance"]};
  if (chain === "43114" && asset === "0x260bbf5698121eb85e7a74f2e45e16ce762ebe11")
    return {symbol: "USTC Axelar", name: "Axelar-wrapped TerraClassicUSD", projects: ["Terra Classic", "Axelar"]};
  if (chain === "43114" && asset === "0xb599c3590f42f8f995ecfa0f85d2980b76862fc1")
    return {symbol: "USTC Wormhole", name: "Wormhole-wrapped TerraClassicUSD", projects: ["Terra Classic", "Wormhole"]};
  const known: Readonly<Record<string, string[]>> = {
    BUSD: ["Paxos", "Binance"], SNX: ["Synthetix"], SUSHI: ["Sushi"], EURT: ["Tether"], DUSD: ["DefiDollar"],
    AAVE: ["Aave"], WETH: ["Ethereum"], USDT: ["Tether"], CDAI: ["Compound", "Sky (formerly MakerDAO)"],
    Y3CRV: ["Yearn Finance", "Curve Finance", "Sky (formerly MakerDAO)", "Circle", "Tether"], USDC: ["Circle"],
    DPI: ["Index Coop", "DeFi Pulse"], DAI: ["Sky (formerly MakerDAO)"], WBTC: ["Wrapped Bitcoin (WBTC)"],
    CUSDC: ["Compound", "Circle"], CREAM: ["Cream Finance"], MIM: ["Abracadabra"], GUSD: ["Gemini"],
    SUSD: ["Synthetix"], EURS: ["STASIS"], CRV: ["Curve Finance"], CUSDT: ["Compound", "Tether"],
    WSTETH: ["Lido"], MUSD: ["mStable"], SEUR: ["Synthetix"], APE: ["ApeCoin"], CVX: ["Convex Finance"],
    LINK: ["Chainlink"], YFI: ["Yearn Finance"], UNI: ["Uniswap"], ALPHA: ["Stella (formerly Alpha Finance Lab)"], WAVAX: ["Avalanche"],
  };
  const base = symbol.replace(/\.e$/i, "").toUpperCase();
  const projects = /^IB(?:EUR|CHF|JPY|KRW|ZAR|AUD|GBP)$/.test(base) ? ["Iron Bank Forex (formerly Fixed Forex)"] : known[base] ?? [name];
  return {symbol, name, projects: symbol.toLowerCase().endsWith(".e") ? [...projects, "Avalanche Bridge"] : projects};
}
export async function returnTags(chainId: string, apiKey: string): Promise<ContractTag[]> {
  if (typeof chainId !== "string" || !Object.hasOwn(CHAINS, chainId)) throw Error("Unsupported Chain ID: " + String(chainId) + ".");
  if (typeof apiKey !== "string" || !apiKey.trim() || /\s/.test(apiKey)) throw Error("A nonempty Graph API key without whitespace is required.");
  const config = CHAINS[chainId], endpoint = "https://gateway.thegraph.com/api/deployments/id/" + config.deployment, deadline = Date.now() + 180_000;
  async function query(document: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error("Iron Bank query deadline exceeded; no partial output returned.");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(30_000, remaining));
    try {
      const response = await fetch(endpoint, {method: "POST", redirect: "error", size: 16_000_000,
        headers: {"content-type": "application/json", authorization: "Bearer " + apiKey},
        body: JSON.stringify({query: document, variables}), signal: controller.signal});
      if (!response.ok) throw Error("Graph HTTP failure.");
      const payload = await response.json() as {data?: Record<string, unknown>; errors?: unknown};
      if (payload.errors !== undefined && (!Array.isArray(payload.errors) || payload.errors.length)) throw Error("Graph query errors.");
      if (!payload.data || typeof payload.data !== "object") throw Error("Missing Graph query data.");
      return payload.data;
    } catch {throw Error("Unable to retrieve complete Iron Bank market-token data.");}
    finally {clearTimeout(timer);}
  }
  // Read the first page and its snapshot metadata in one Graph response.
  // Separate head/data requests can be routed to differently lagging indexers.
  let result = await query(MARKETS_QUERY.replace("$block: Block_height!", "$block: Block_height"), {block: null, last: ""});
  const head = checkMeta(result._meta, config.deployment);
  if (!head.block.hash) throw Error("Iron Bank source omitted its indexed snapshot hash.");
  const tags = new Map<string, ContractTag>(); let cursor = "";
  while (true) {
    checkMeta(result._meta, config.deployment, head.block.number, head.block.hash);
    const rows = result.markets as Market[];
    if (!Array.isArray(rows) || rows.length > PAGE) throw Error("Invalid Iron Bank market page.");
    for (const row of rows) {
      if (!row || typeof row.id !== "string" || row.id <= cursor) throw Error("Iron Bank cursor did not advance strictly.");
      cursor = row.id; const contract = address(row.outputToken?.id), market = address(row.id);
      if (market !== contract || address(row.protocol?.id) !== config.controller) throw Error("Inconsistent indexed Iron Bank market identity.");
      // These two Ethereum rows are misclassified by the source: their deployed
      // comptroller() is Cream's 0x3d5bc3c8d13dcb8bf317092d84783c2697ae9258,
      // not Iron Bank's controller. Exclude these wrong-protocol records only.
      // No activity, listing, balance or legacy-branding filter is applied.
      if (chainId === "1" && (market === "0xab10586c918612ba440482db77549d26b7abf8f7" || market === "0xdfff11dfe6436e42a17b86e7f419ac8292990393")) continue;
      const asset = address(row.inputToken?.id), indexedSymbol = plain(row.inputToken?.symbol), indexedName = plain(row.inputToken?.name);
      const tokenName = plain(row.outputToken?.name), tokenSymbol = plain(row.outputToken?.symbol), assetIdentity = identity(chainId, asset, indexedSymbol, indexedName);
      const label = "Iron Bank " + assetIdentity.symbol + " Receipt Token";
      // Indexed legacy Yearn/Cream accounting identities are retained as such,
      // not represented as an active association or current onchain metadata.
      const historic = /^Yearn\b/i.test(tokenName) ? ["Yearn Finance (historical indexed identity)"] : /^Cream\b/i.test(tokenName) ? ["Cream Finance (historical indexed identity)"] : [];
      const associated = [...new Set(["Iron Bank", "Compound (upstream protocol code)", ...historic, ...assetIdentity.projects])];
      const tag: ContractTag = {
        "Contract Address": "eip155:" + chainId + ":" + contract,
        "Public Name Tag": label,
        "Project Name": "Iron Bank",
        "UI/Website Link": "https://github.com/ibdotxyz/compound-protocol",
        "Public Note": associated.join("; ") + ". Iron Bank lending-market receipt token on " + config.name + " for " + assetIdentity.name + " (" + assetIdentity.symbol + "), underlying " + asset +
          ". Indexed underlying identity: " + indexedName + " (" + indexedSymbol + "). Indexed receipt identity: " + tokenName + " (" + tokenSymbol + "). Controller " + config.controller +
          ". Includes historical and delisted accounting contracts; no claim of enabled lending, balances, solvency, peg or redemption availability.",
      };
      const prior = tags.get(contract);
      if (prior && JSON.stringify(prior) !== JSON.stringify(tag)) throw Error("Conflicting Iron Bank receipt-token associations.");
      tags.set(contract, tag);
    }
    if (rows.length < PAGE) break;
    result = await query(MARKETS_QUERY, {block: {hash: head.block.hash}, last: cursor});
  }
  if (!tags.size) throw Error("Iron Bank returned no market receipt tokens.");
  const counts = new Map<string, number>();
  for (const tag of tags.values()) counts.set(tag["Public Name Tag"].toLowerCase(), (counts.get(tag["Public Name Tag"].toLowerCase()) ?? 0) + 1);
  const names = new Set<string>();
  for (const tag of tags.values()) {
    const addr = tag["Contract Address"].split(":")[2], suffix = counts.get(tag["Public Name Tag"].toLowerCase())! > 1 ? " (" + addr.slice(0, 10) + ")" : "";
    // Distinct historical/current receipts for the same asset are not merged.
    // A short queried contract identifier distinguishes their instance labels.
    tag["Public Name Tag"] = tag["Public Name Tag"].slice(0, 50 - suffix.length) + suffix;
    const key = tag["Public Name Tag"].toLowerCase();
    if (names.has(key)) throw Error("Ambiguous Iron Bank receipt-token public labels.");
    names.add(key);
  }
  const service: ITagService = {returnTags: async () => [...tags.values()]};
  return service.returnTags(chainId, apiKey);
}
