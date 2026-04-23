/**
 * Builder = default technical copy. ELI5 = plain-English labels + optional hover tips (preschool-friendly).
 * Logic and API payloads are unchanged; only presentation strings differ by mode.
 */
export type KilnViewMode = 'builder' | 'eli5';

const C = {
  headerTagline: {
    b: 'Pre-deploy validation + live deployment + Bert/Ernie E2E for Tezos builders.',
    e: 'Check your contract, launch it on the practice network, then run pretend wallet tests—without touching mainnet money here.',
    tip: 'Kiln is a workshop: Shadownet is a fake-money test chain. Bert and Ernie are robot wallets the server uses so you can try transfers and calls safely.',
  },
  viewModeBuilder: {
    b: 'Builder',
    e: 'Builder',
    tip: 'Technical labels and the usual Tezos wording you already see in docs and tooling.',
  },
  viewModeEli5: {
    b: 'ELI5',
    e: 'ELI5',
    tip: '“Explain Like I’m 5”: every label turns into plain English. Hover (or long-press on mobile) dotted underlines for the full story.',
  },
  networkArchTitle: {
    b: 'Network Architecture',
    e: 'Which blockchain network is this?',
    tip: 'Shows which network Kiln is talking to right now. Shadownet is for practice; “planned” means the UI is aware of mainnet-style targets but you are not live on them from this screen alone.',
  },
  networkArchBody: {
    b: 'Shadownet is active now. Tezos Mainnet and Tezos EVM support are modeled as planned targets.',
    e: 'You are on the practice chain (Shadownet). Mainnet and Tezos EVM (rollup-style) support are listed as future targets—not live from this screen.',
    tip: 'Always double-check the “Active” line before you sign anything in your real wallet. Practice networks use worthless test coins.',
  },
  deploymentTitle: {
    b: 'Deployment Control',
    e: 'How do you want to publish this contract?',
    tip: 'Publishing = sending a special “origination” transaction that creates a new contract on the chain. You can use your own wallet, or a built-in test wallet named Bert.',
  },
  deploymentBody: {
    b: 'Deploy from your connected wallet (admin-safe) or with puppet wallet Bert.',
    e: 'Use your real Temple/Kukai wallet if you want to be the boss of the contract, or use Bert if you just want a quick throwaway deploy for testing.',
    tip: '“Puppet” means the server holds the secret key—not you. Fine for learning; for anything serious, use Connected Wallet and verify admin addresses.',
  },
  connectWalletHeading: {
    b: 'Connect Shadownet Wallet (Beacon)',
    e: 'Hook up your practice wallet (Temple or Kukai)',
    tip: 'Beacon is the standard way Tezos websites ask your wallet for permission. You stay in control: the site never sees your seed phrase.',
  },
  kukaiNote: {
    b: 'Kukai users: keep Kukai opened on shadownet.kukai.app before approving.',
    e: 'If you use Kukai, open the Shadownet version of Kukai first, then come back here to approve.',
    tip: 'Kukai has different sites for mainnet vs testnets. Shadownet lives at shadownet.kukai.app so your approvals go to the practice chain.',
  },
  connectedWalletHeading: {
    b: 'Connected Wallet Status',
    e: 'Your wallet right now',
    tip: 'Shows the address Kiln will use when you pick “Deploy with Connected Wallet” and when you optionally swap the contract admin to your address.',
  },
  noWalletConnected: {
    b: 'No wallet connected yet.',
    e: 'No wallet linked yet—tap Connect above.',
    tip: 'Connecting does not deploy anything by itself. It only lets Kiln propose transactions for you to approve in the wallet popup.',
  },
  adminCheckboxTitle: {
    b: 'Set my connected wallet as the contract admin in initial storage',
    e: 'Make me the admin of this contract when I deploy from my wallet',
    tip: 'Many templates ship with a placeholder admin address in storage. Checking this replaces that placeholder with your connected tz1… so you—not a burn address—control pause, upgrades, etc.',
  },
  adminCheckboxDetail: {
    b: 'Only for Deploy with Connected Wallet. Compiled Kiln token storage leaves a fixed admin address in the Micheline; with this on, that address is replaced by your Beacon tz1… before origination so your wallet holds admin. Uncheck if you already set admin yourself. Match is literal: tz1burnburnburnburnburnburnburjAYjjX',
    e: 'Only applies when you deploy with your own wallet. Kiln swaps a fake “burn” admin placeholder in the storage blob for your real address so you stay in charge. Turn this off if you already edited admin by hand.',
    tip: 'Admin is the super-user of the contract. If you leave the placeholder, nobody human controls it—bad for anything beyond a demo.',
  },
  workflowGateTitle: {
    b: 'Workflow Gate',
    e: 'Safety checklist before deploy',
    tip: 'Think of this as a factory quality line: compile (if SmartPy), shape-check Michelson, static audit, pretend wallet simulation, shadowbox runtime checks, then a “clearance ticket” you need before the big Deploy button unlocks.',
  },
  workflowGateLine1: {
    b: 'Deployment is gated by compile, validation, audit, simulation, and shadowbox runtime clearance.',
    e: 'You cannot use the main Deploy button until Kiln has run its checks and given you a green clearance.',
    tip: 'This reduces “oops I pasted garbage Michelson” and catches some foot-guns. It is not a formal security audit of your business logic.',
  },
  workflowGateLine2: {
    b: 'You can run all workflow stages before deploying anything on shadownet.',
    e: 'You can press “Run full workflow” as many times as you like before you ever hit Deploy.',
    tip: 'Iterating on source? Re-run workflow after each edit. Clearance IDs expire; that is normal.',
  },
  bertErnieNearWallets: {
    b: 'Bert and Ernie are puppet wallets controlled by the test suite.',
    e: 'Bert and Ernie are pretend people: two test wallets the app can drive so you can watch balances and calls without touching your own coins.',
    tip: 'They are not children’s TV characters on-chain—just nicknames for Wallet A and Wallet B keys held by the Kiln server for Shadownet demos. Never fund these addresses on mainnet.',
  },
  bertWalletSubtitle: {
    b: 'Puppet wallet',
    e: 'Robot test wallet #1',
    tip: 'Bert is “wallet A” in the backend. Used for simulations, E2E runs, and optional Bert deploys.',
  },
  ernieWalletSubtitle: {
    b: 'Puppet wallet',
    e: 'Robot test wallet #2',
    tip: 'Ernie is “wallet B”. Often the second actor in a two-wallet story (buyer/seller, etc.).',
  },
  contractInjectorTitle: {
    b: 'Contract Injector',
    e: 'Paste or upload your contract code here',
    tip: 'Michelson is the low-level language Tezos runs. SmartPy is Python that compiles to Michelson. Pick the mode that matches what you pasted.',
  },
  initialStorageLabel: {
    b: 'Initial Storage',
    e: 'Starting data the contract holds on day one',
    tip: 'Storage is the contract’s memory at origination. Often Unit or a pair of addresses and numbers. Wrong storage = deploy fails or misbehaves.',
  },
  smartpyHelpBlurb: {
    b: 'SmartPy sources can be loaded from .py, .smartpy, .sp, or .txt files. The workflow compiles SmartPy to Michelson server-side when SmartPy mode is active or auto-detected.',
    e: 'If you use Python-style SmartPy files, you can upload them here. Kiln will turn them into Michelson on the server when you run the workflow.',
    tip: 'Single-file contracts work best. Huge multi-folder projects may need you to compile locally and paste the .tz instead.',
  },
  placeholderMichelson: {
    b: 'Paste Michelson code here, upload a file, or double-click to open file picker...',
    e: 'Drop in the .tz Michelson text, or double-click to pick a file…',
    tip: 'Michelson has parameter, storage, and code sections. If you are lost, try the Guided Contract Creator first.',
  },
  placeholderSmartpy: {
    b: 'Paste SmartPy source (.py/.smartpy/.sp/.txt), upload a file, or double-click to open file picker...',
    e: 'Drop in your SmartPy/Python contract, or double-click to pick a file…',
    tip: 'Your file should eventually run tests that output compiled scenarios; otherwise the server may not find a .tz to extract.',
  },
  runFullWorkflow: {
    b: 'Run Full Workflow',
    e: 'Run every safety check once',
    tip: 'Compile (if SmartPy), validate Michelson shape, audit, simulate with Bert/Ernie, run shadowbox runtime checks, then mint a clearance ID if all required gates pass.',
  },
  runWorkflowTests: {
    b: 'Run Workflow Tests',
    e: 'Run all safety checks (no deploy yet)',
    tip: 'Same engine as “Run Full Workflow” in the gate section—use whichever button is closer to your mouse.',
  },
  exportSource: {
    b: 'Export Source',
    e: 'Download my current source file',
    tip: 'Saves what is in the big editor as a text file (.py for SmartPy mode, .tz for Michelson mode).',
  },
  exportMichelson: {
    b: 'Export Michelson',
    e: 'Download last compiled .tz',
    tip: 'Only works after a successful workflow run that produced Michelson artifacts.',
  },
  exportMainnetBundle: {
    b: 'Export Mainnet Bundle',
    e: 'Zip a “serious deploy” evidence pack',
    tip: 'Bundles source, compiled Michelson, audit/simulation JSON, and a readiness markdown for humans—not a substitute for legal review.',
  },
  clearedForDeployment: {
    b: 'Cleared For Deployment',
    e: 'Green light: you may deploy',
    tip: 'A clearance token was issued tying this code hash to passing checks. Deploy buttons look for it.',
  },
  notCleared: {
    b: 'Not Cleared',
    e: 'Not ready—run workflow first',
    tip: 'Fix issues in the log, then re-run workflow until this flips green.',
  },
  michelsonModeBtn: {
    b: 'Michelson',
    e: 'Michelson mode',
    tip: 'The native Tezos language. Paste or upload .tz here.',
  },
  smartpyModeBtn: {
    b: 'SmartPy',
    e: 'SmartPy mode',
    tip: 'Python-flavored contracts. Kiln can compile to Michelson on the server when you run workflow.',
  },
  uploadSource: {
    b: 'Upload Source',
    e: 'Choose file',
    tip: 'Opens your file picker. Extensions include .tz, .py, .smartpy, and friends.',
  },
  deployModeConnected: {
    b: 'Connected Wallet',
    e: 'Use my wallet',
    tip: 'You sign with Temple/Kukai; you are the human in the loop.',
  },
  deployModePuppet: {
    b: 'Puppet Wallet (Bert)',
    e: 'Use Bert (server wallet)',
    tip: 'Faster throwaway deploys for demos. The server holds the key.',
  },
  deployWithConnected: {
    b: 'Deploy with Connected Wallet',
    e: 'Go live on the network using my wallet',
    tip: 'Opens your wallet to sign an origination. You pay fees from your balance. Requires workflow clearance first.',
  },
  deployWithBert: {
    b: 'Inject & Deploy with Bert',
    e: 'Let Bert pay and publish for a quick test',
    tip: 'Injects Kiln dummy token addresses into the code (if applicable) then originates using the server-held Bert key. Fast for demos; not for production custody.',
  },
  dynamicRigTitle: {
    b: 'Dynamic Test Rig',
    e: 'Try entrypoints after deploy',
    tip: 'Once you have a KT1 address, this panel builds little forms from the contract’s entrypoints so you can fire test calls as Bert or Ernie.',
  },
  e2eEntrypointLabel: {
    b: 'Post-deploy E2E Entrypoint',
    e: 'Which doorbell to ring on the contract?',
    tip: 'Entrypoint = a named function on the contract (like transfer or mint). Must match a name the contract actually exposes.',
  },
  e2eArgsLabel: {
    b: 'Args (JSON Array)',
    e: 'Arguments as a JSON list',
    tip: 'Tezos wants Micheline-shaped values. Here you type JSON like [] or ["tz1...", 1] and the server converts for the test call.',
  },
  runBertErnieE2e: {
    b: 'Run Bert + Ernie E2E',
    e: 'Run a two-puppet automatic test',
    tip: 'Calls the same entrypoint twice in a scripted sequence—once as Bert, once as Ernie—so you can see both sides of a flow in the logs.',
  },
  kilnTerminalLabel: {
    b: 'Kiln Terminal',
    e: 'Activity log',
    tip: 'Plain-English-ish status lines from Kiln: deploy results, workflow steps, errors. Helpful when something fails mid-flight.',
  },
  guidedTitle: {
    b: 'Guided Contract Creator (Optional)',
    e: 'Beginner-friendly contract wizard (optional)',
    tip: 'Answer a few questions and Kiln drafts SmartPy or a tiny Michelson stub you can load into the injector. Faster than starting from a blank page.',
  },
  guidedIntro: {
    b: 'Builder-first wizard for laymen and pros: choose contract shape, entrypoints, and output mode.',
    e: 'Pick what kind of thing you are building (tokens, NFTs, marketplace), tick features, and choose whether you want Python code or a ready-to-try Michelson stub.',
    tip: 'This does not replace reading FA2 specs or audits—it jump-starts a template aligned with common Shadownet test tokens.',
  },
  labelContractType: {
    b: 'Contract Type',
    e: 'What are you building?',
    tip: 'FA2 fungible = interchangeable coins. NFT collection = unique IDs. Marketplace = list/swap style flows (simplified template).',
  },
  labelOutput: {
    b: 'Output',
    e: 'What should we generate?',
    tip: 'SmartPy scaffold = Python you will compile later. Michelson stub = a minimal .tz you can deploy immediately for plumbing tests.',
  },
  labelProjectName: {
    b: 'Project Name',
    e: 'Friendly name for this project',
    tip: 'Used inside generated class/module names and metadata-ish strings. Pick something short and alphanumeric.',
  },
  labelAdminAddress: {
    b: 'Admin Address (optional)',
    e: 'Boss wallet address (optional)',
    tip: 'tz1… address of whoever should pause, upgrade, or manage privileged roles. Leave blank to fill later.',
  },
  labelSymbol: {
    b: 'Symbol',
    e: 'Ticker letters (like “KILN”)',
    tip: 'Traditionally 3–6 uppercase characters shown in wallets and explorers.',
  },
  labelDecimals: {
    b: 'Decimals',
    e: 'How many decimal places for amounts',
    tip: '6 decimals means 1.000000 display tokens = 1,000,000 smallest units internally.',
  },
  labelInitialSupply: {
    b: 'Initial Supply',
    e: 'How many tokens exist at the start',
    tip: 'In smallest units after decimals. Huge numbers are fine on testnets; think twice on mainnet economics.',
  },
  labelMaxCollection: {
    b: 'Max Collection Size',
    e: 'Max number of NFTs in this collection',
    tip: 'Caps minting so you cannot accidentally issue unlimited IDs.',
  },
  labelRoyaltiesBps: {
    b: 'Default Royalties (bps)',
    e: 'Creator cut on secondary sales (basis points)',
    tip: '10,000 bps = 100%. 500 bps = 5%. Royalties are enforced by marketplace cooperation, not by magic.',
  },
  labelMarketplaceFeeBps: {
    b: 'Marketplace Fee (bps)',
    e: 'Fee the marketplace charges (basis points)',
    tip: 'Same bps math: 250 bps = 2.5% platform fee on trades in the template story.',
  },
  checkMint: {
    b: 'Mint',
    e: 'Allow creating new tokens',
    tip: 'Mint entrypoints let authorized actors increase supply or assign new NFT IDs.',
  },
  checkBurn: {
    b: 'Burn',
    e: 'Allow destroying tokens',
    tip: 'Burn removes balance from someone who opts in or is allowed by rules—good for supply sinks.',
  },
  checkPause: {
    b: 'Pause',
    e: 'Emergency pause switch',
    tip: 'Admin can freeze user-facing actions during an incident. Also a centralization risk if keys are lost.',
  },
  checkAdminTransfer: {
    b: 'Admin Transfer',
    e: 'Admin can force-move tokens',
    tip: 'Powerful recovery tool and powerful rug vector—only enable if you understand custody.',
  },
  referenceElementsTitle: {
    b: 'Reference-Sliced Elements',
    e: 'Extra powers copied from famous contracts',
    tip: 'Each checkbox pulls patterns Kiln found in curated reference contracts—like operator lists or fee knobs—and weaves them into your draft.',
  },
  referenceElementsIntro: {
    b: 'These options are mined from real contracts in reference/ and stitched into your guided draft.',
    e: 'Each line below comes from studying real on-chain templates, then slicing reusable chunks for your wizard output.',
    tip: 'Read each card’s description: it is still fairly technical. Hover this whole section in ELI5 mode for the gist.',
  },
  loadingReferenceElements: {
    b: 'Loading reference elements...',
    e: 'Fetching the recipe cards…',
    tip: 'Calls the Kiln API for the list of optional modules for your selected contract type.',
  },
  evidencePrefix: {
    b: 'Evidence:',
    e: 'Backed by',
    tip: 'How many real contracts we mined for this optional feature slice.',
  },
  evidenceSuffix: {
    b: 'reference contracts',
    e: 'on-chain templates',
    tip: 'These are curated reads of deployed contracts—not an endorsement to copy-paste without review.',
  },
  primaryGenerateSmartpy: {
    b: 'Generate SmartPy Scaffold',
    e: 'Write me Python (SmartPy) starter code',
    tip: 'Hits the guided API and returns a scaffold you can edit, compile, and test off-site or in Kiln if compilation is set up.',
  },
  primaryGenerateMichelsonStub: {
    b: 'Generate Deployable Michelson Stub',
    e: 'Write me a tiny ready-to-deploy .tz stub',
    tip: 'Faster path to click through deploy/E2E without running SmartPy—useful for plumbing tests, not product logic.',
  },
  copyOutput: {
    b: 'Copy Output',
    e: 'Copy generated code',
    tip: 'Copies the textarea contents to your clipboard so you can paste into an editor.',
  },
  useInInjector: {
    b: 'Use In Contract Injector',
    e: 'Load this into the big editor below',
    tip: 'Only enabled for Michelson stub mode. SmartPy must be compiled before inject/deploy as Michelson.',
  },
  generatedSummarySmartpy: {
    b: 'Generated SmartPy scaffold with entrypoints:',
    e: 'Here is your Python starter. It exposes these entrypoints:',
    tip: 'Entrypoint names must match what you later call from the Dynamic Rig or E2E tools.',
  },
  generatedSummaryMichelson: {
    b: 'Generated Michelson stub with entrypoints:',
    e: 'Here is your Michelson stub. It exposes these entrypoints:',
    tip: 'You can deploy this stub directly if storage matches what you paste in Initial Storage.',
  },
  initialStorageHintLabel: {
    b: 'Initial storage hint:',
    e: 'Starting storage suggestion:',
    tip: 'A Micheline-ish snippet the generator thinks matches the stub—verify before mainnet.',
  },
  dynamicRigEmptyState: {
    b: 'Deploy a contract to generate the test rig.',
    e: 'Deploy something first—then this panel wakes up.',
    tip: 'The rig needs a KT1 address plus parsed entrypoints from your last workflow/deploy.',
  },
  dynamicRigActiveContract: {
    b: 'Active Contract',
    e: 'Contract you are poking at',
    tip: 'This KT1 is live on whatever network your Kiln server is pointed at (usually Shadownet).',
  },
  dynamicRigExecuteAs: {
    b: 'Execute as puppet wallet:',
    e: 'Send the test call pretending to be:',
    tip: 'Bert or Ernie signs the operation from the server. Good for quick manual probes after deploy.',
  },
  dynamicRigNoArgs: {
    b: 'No arguments required for this entrypoint.',
    e: 'This action needs no inputs—just hit Run.',
    tip: 'Some entrypoints take Unit or implicit parameters; still read the contract to be sure.',
  },
  dynamicRigExecute: {
    b: 'Execute',
    e: 'Send this call',
    tip: 'Builds parameters from the fields and sends an operation via the Kiln API using the selected puppet wallet.',
  },
  dynamicRigNoEntrypoints: {
    b: 'No entrypoints found or ABI parsing not implemented for this format.',
    e: 'No buttons to show yet—entrypoints missing or not readable.',
    tip: 'Run workflow after deploy so Kiln can parse Michelson annotations, or check that your contract exposes standard entrypoint tags.',
  },
  tabSetupLabel: {
    b: 'Setup',
    e: 'Set up',
    tip: 'Pick the network and connect the wallet you want to use for this session. Everything downstream assumes this is correct.',
  },
  tabBuildLabel: {
    b: 'Build',
    e: 'Build',
    tip: 'Author or paste the contract source. Tezos mode accepts Michelson/SmartPy; Etherlink mode accepts Solidity.',
  },
  tabValidateLabel: {
    b: 'Validate',
    e: 'Check',
    tip: 'Compile, shape-check, static audit, and simulate against puppet wallets. Deployment is blocked until this passes.',
  },
  tabDeployLabel: {
    b: 'Deploy',
    e: 'Launch',
    tip: 'Originate the contract. Locked until validation grants a clearance ticket.',
  },
  tabTestLabel: {
    b: 'Test',
    e: 'Poke it',
    tip: 'Dynamic rig for post-deploy calls and Bert/Ernie E2E runs (where supported).',
  },
  tabHandoffLabel: {
    b: 'Handoff',
    e: 'Wrap up',
    tip: 'Export source, compiled artifacts, and a mainnet-ready zip bundle so someone else can verify and redeploy.',
  },
  tabSetupIntro: {
    b: 'Choose a network, connect a wallet, and check puppet funds before you spend iteration time.',
    e: 'First: pick where this is going, link a wallet, and see if the robot test wallets have practice coins.',
    tip: 'Switching networks mid-session is safe — state is preserved. Mainnets prompt a consent dialog because they spend real money.',
  },
  tabBuildIntro: {
    b: 'Write or import contract source. The guided builder can generate scaffolds; the injector accepts anything you paste.',
    e: 'Write your contract here. You can use the helper to get a starter, or paste your own.',
    tip: 'Tezos networks accept Michelson or SmartPy. Etherlink networks expect Solidity (compiled server-side via solc-js).',
  },
  tabValidateIntro: {
    b: 'Compile, shape-check, static audit, and simulate against puppets. All must pass before Deploy unlocks.',
    e: 'Run the full checklist: compile, sanity-check, security scan, and pretend wallet tests.',
    tip: 'Validation results grant a short-lived clearance id. Editing source invalidates it — re-run before deploying.',
  },
  tabDeployIntro: {
    b: 'Originate the contract. Puppet deploy is fastest on sandboxes; connected wallet is required on mainnet.',
    e: 'Ready to publish? Pick how you want to sign it, then press Deploy. On mainnet, it will be your own wallet.',
    tip: 'Deploys write to the live chain. Mainnets cost real tez/XTZ; double-check the address, admin, and initial storage.',
  },
  tabTestIntro: {
    b: 'Drive the live contract. Bert/Ernie E2E runs where puppets are available; manual execute works on every network.',
    e: 'Your contract is alive. Push buttons on it and see what happens. Robot wallets are only on practice chains.',
    tip: 'For mainnet contracts, use the dynamic rig carefully — each button is a real transaction.',
  },
  tabHandoffIntro: {
    b: 'Export reproducible artifacts so the next person can verify, audit, and mainnet-deploy on their own.',
    e: 'Save everything: your source, the compiled output, test results, and a zip to share.',
    tip: 'The mainnet bundle includes source, compiled Michelson, validation report, audit findings, and deployment metadata.',
  },
  networkPickerTitle: {
    b: 'Target Network',
    e: 'Which chain are we pointing at?',
    tip: 'Controls where every deploy, call, and estimate goes. Sandbox is free. Testnets need faucet funds. Mainnets spend real money.',
  },
  networkPickerBody: {
    b: 'Kiln now ships with Tezos Shadownet/Mainnet and Etherlink Testnet/Mainnet. Switch any time; state persists.',
    e: 'You can build on the sandbox and push to mainnet later. Etherlink is the Tezos EVM rollup — Solidity lives there.',
    tip: 'Switching mainnet requires explicit consent. RPC URLs can be overridden via env vars if defaults rate-limit you.',
  },
  walletTezosConnect: {
    b: 'Connect Tezos wallet',
    e: 'Hook up a Tezos wallet',
    tip: 'Opens Beacon — pick Temple or Kukai. Make sure the wallet is on the same Tezos network as Kiln or the deploy will refuse.',
  },
  walletEvmConnect: {
    b: 'Connect EVM wallet',
    e: 'Hook up MetaMask',
    tip: 'Uses EIP-1193. Kiln will ask MetaMask to switch or add the Etherlink chain automatically.',
  },
  walletEvmMissing: {
    b: 'No EVM wallet detected — install MetaMask and reload.',
    e: 'You need MetaMask (or a similar wallet) installed in this browser.',
    tip: 'Etherlink deploys go through your browser wallet directly — Kiln never handles your private key.',
  },
  mainnetBanner: {
    b: 'Mainnet mode: real funds. Puppets disabled. Double-check every approval.',
    e: 'You are on mainnet. The money is real. Read before clicking.',
    tip: 'Mainnet is irreversible. Validate thoroughly, make sure admin is correct, and budget enough tez/XTZ for fees and storage.',
  },
  sourceLangMichelson: {
    b: 'Michelson',
    e: 'Michelson',
    tip: 'Tezos stack-based bytecode. What the chain actually runs. Text form is .tz; compact JSON is .json.',
  },
  sourceLangSmartpy: {
    b: 'SmartPy',
    e: 'SmartPy (Python)',
    tip: 'Python-flavoured DSL that compiles to Michelson server-side. Good for rapid iteration.',
  },
  sourceLangSolidity: {
    b: 'Solidity',
    e: 'Solidity',
    tip: 'EVM contract language. Kiln compiles it with solc-js on the server and you deploy via MetaMask.',
  },
  solidityCompileBtn: {
    b: 'Compile Solidity',
    e: 'Turn my Solidity into bytecode',
    tip: 'Runs solc-js on the server, returns bytecode + ABI. Errors show inline. Warnings do not block deploy.',
  },
  solidityEstimateBtn: {
    b: 'Estimate deploy gas',
    e: 'How much will this cost to launch?',
    tip: 'Asks the Etherlink node for a gas estimate using the compiled bytecode + your constructor args.',
  },
  solidityDryRunBtn: {
    b: 'Dry-run deploy',
    e: 'Pretend-deploy to see if it works',
    tip: 'Submits the deploy to the node in a simulated call — no tx fires, but constructor reverts get surfaced.',
  },
  evmDeployBtn: {
    b: 'Deploy via MetaMask',
    e: 'Send it to mainnet (MetaMask)',
    tip: 'Kiln encodes the deploy calldata; MetaMask will ask you to approve the transaction.',
  },
  stepperGuardLocked: {
    b: 'Locked — complete earlier steps first.',
    e: 'Not unlocked yet. Finish the steps before this one.',
    tip: 'Tabs unlock as you satisfy their prerequisites (source → clearance → deploy → test).',
  },
  stepperGuardReady: {
    b: 'Ready',
    e: 'Good to go',
    tip: 'All prerequisites met — this tab will do real work when clicked.',
  },
  stepperGuardDone: {
    b: 'Done',
    e: 'Finished',
    tip: 'You have completed the primary action for this tab. You can revisit freely.',
  },
  deployClearanceId: {
    b: 'Clearance id',
    e: 'Safety ticket number',
    tip: 'This id is required on the deploy endpoint. If source changes, Kiln invalidates it — rerun validation.',
  },
  evmCompileHint: {
    b: 'Solidity compile runs solc-js server-side. Paste a single-file contract; imports are not resolved yet.',
    e: 'One file only, no imports yet. Paste the whole thing and press Compile.',
    tip: 'Import resolution for node_modules / remappings is on the roadmap. Flatten your contract for now.',
  },
  evmConstructorArgs: {
    b: 'Constructor args (JSON array)',
    e: 'Inputs for the contract constructor',
    tip: 'Must be a JSON array, e.g. [] or ["0xYourAddress", 1000000]. Order matches the constructor signature.',
  },
  evmEntryContract: {
    b: 'Entry contract name',
    e: 'Which contract in the file to deploy',
    tip: 'If the source declares multiple contracts, name the one you want deployed. Leave blank to pick the last one.',
  },
} as const;

export type CopyKey = keyof typeof C;

export function viewText(mode: KilnViewMode, key: CopyKey): string {
  const row = C[key];
  return mode === 'builder' ? row.b : row.e;
}

export function viewTip(mode: KilnViewMode, key: CopyKey): string | undefined {
  return mode === 'eli5' ? C[key].tip : undefined;
}
