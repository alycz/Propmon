// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PerplPriceAdapter} from "../src/oracle/PerplPriceAdapter.sol";
import {AccountRegistry} from "../src/registry/AccountRegistry.sol";
import {RuleEngine} from "../src/rules/RuleEngine.sol";
import {ExaminationVault} from "../src/vaults/ExaminationVault.sol";
import {FundedVault} from "../src/vaults/FundedVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface VmJson {
    function serializeString(string calldata objectKey, string calldata valueKey, string calldata value)
        external
        returns (string memory);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value)
        external
        returns (string memory);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value)
        external
        returns (string memory);
    function writeJson(string calldata json, string calldata path) external;
}

interface VmEnv {
    function envAddress(string calldata key) external returns (address);
    function envUint(string calldata key) external returns (uint256);
}

/// @notice Deploys the full Propmon Monad Testnet stack in the fixed integration order.
contract Deploy is Script {
    VmJson private constant vmJson = VmJson(address(uint160(uint256(keccak256("hevm cheat code")))));
    VmEnv private constant vmEnv = VmEnv(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant DEFAULT_CHAIN_ID = 10143;
    uint256 private constant DEFAULT_MAX_PRICE_AGE = 300;
    uint256 private constant DEFAULT_RULE_TIER_ID = 1;
    uint256 private constant DEFAULT_TRADER_SHARE_BPS = 8000;

    address private constant DEFAULT_AUSD = 0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
    uint256 private constant BTC_MARKET_ID = 16;
    uint256 private constant ETH_MARKET_ID = 32;
    uint256 private constant SOL_MARKET_ID = 48;
    uint256 private constant MON_MARKET_ID = 64;
    uint256 private constant ZEC_MARKET_ID = 256;

    struct DeploymentSet {
        address accountRegistry;
        address ruleEngine;
        address perplPriceAdapter;
        address examinationVault;
        address fundedVault;
    }

    struct RuntimeConfig {
        address deployer;
        address relayer;
        address reconciler;
        address protocolTreasury;
        IERC20 settlementToken;
        uint256 maxPriceAge;
        uint256 traderShareBps;
    }

    function run() external returns (DeploymentSet memory deployments) {
        RuntimeConfig memory config = _runtimeConfig();

        vm.startBroadcast();

        AccountRegistry accountRegistry = new AccountRegistry(config.deployer);
        RuleEngine ruleEngine = new RuleEngine(config.deployer);
        PerplPriceAdapter perplPriceAdapter = new PerplPriceAdapter(config.deployer, config.relayer);
        (ExaminationVault examinationVault, FundedVault fundedVault) =
            _deployVaults(config, accountRegistry, ruleEngine, perplPriceAdapter);

        accountRegistry.grantRole(accountRegistry.VAULT_ROLE(), address(examinationVault));
        accountRegistry.grantRole(accountRegistry.VAULT_ROLE(), address(fundedVault));
        ruleEngine.grantRole(ruleEngine.ACCOUNT_CONFIG_ROLE(), address(examinationVault));
        ruleEngine.grantRole(ruleEngine.ACCOUNT_CONFIG_ROLE(), address(fundedVault));

        _configureMarketDecimals(examinationVault, fundedVault);

        deployments = DeploymentSet({
            accountRegistry: address(accountRegistry),
            ruleEngine: address(ruleEngine),
            perplPriceAdapter: address(perplPriceAdapter),
            examinationVault: address(examinationVault),
            fundedVault: address(fundedVault)
        });

        vm.stopBroadcast();
        console2.log("AccountRegistry", address(accountRegistry));
        console2.log("RuleEngine", address(ruleEngine));
        console2.log("PerplPriceAdapter", address(perplPriceAdapter));
        console2.log("ExaminationVault", address(examinationVault));
        console2.log("FundedVault", address(fundedVault));
        console2.log("SettlementToken", address(config.settlementToken));
        console2.log("ProtocolTreasury", config.protocolTreasury);
        console2.log("Relayer", config.relayer);
        console2.log("Reconciler", config.reconciler);
        _writeDeployments(deployments);
    }

    function _runtimeConfig() internal returns (RuntimeConfig memory config) {
        config.deployer = _envAddressOr("OWNER_ADDRESS", msg.sender);
        config.relayer = _envAddressOr("RELAYER_ADDRESS", config.deployer);
        config.reconciler = _envAddressOr("RECONCILER_ADDRESS", config.deployer);
        config.protocolTreasury = _envAddressOr("PROTOCOL_TREASURY", config.deployer);
        config.settlementToken = IERC20(_envAddressOr("SETTLEMENT_TOKEN_ADDRESS", DEFAULT_AUSD));
        config.maxPriceAge = _envUintOr("MAX_PRICE_AGE", DEFAULT_MAX_PRICE_AGE);
        config.traderShareBps = _envUintOr("TRADER_SHARE_BPS", DEFAULT_TRADER_SHARE_BPS);
    }

    function _deployVaults(
        RuntimeConfig memory config,
        AccountRegistry accountRegistry,
        RuleEngine ruleEngine,
        PerplPriceAdapter perplPriceAdapter
    ) internal returns (ExaminationVault examinationVault, FundedVault fundedVault) {
        examinationVault = new ExaminationVault(
            accountRegistry,
            perplPriceAdapter,
            ruleEngine,
            config.maxPriceAge,
            DEFAULT_RULE_TIER_ID,
            config.deployer
        );
        fundedVault = new FundedVault(
            accountRegistry,
            examinationVault,
            perplPriceAdapter,
            ruleEngine,
            config.settlementToken,
            config.protocolTreasury,
            config.maxPriceAge,
            config.traderShareBps,
            config.deployer,
            config.reconciler
        );
    }

    function _envAddressOr(string memory key, address defaultValue) internal returns (address) {
        try vmEnv.envAddress(key) returns (address value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _envUintOr(string memory key, uint256 defaultValue) internal returns (uint256) {
        try vmEnv.envUint(key) returns (uint256 value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _configureMarketDecimals(ExaminationVault examinationVault, FundedVault fundedVault) internal {
        examinationVault.setMarketSizeDecimals(BTC_MARKET_ID, 5);
        examinationVault.setMarketSizeDecimals(ETH_MARKET_ID, 3);
        examinationVault.setMarketSizeDecimals(SOL_MARKET_ID, 3);
        examinationVault.setMarketSizeDecimals(MON_MARKET_ID, 0);
        examinationVault.setMarketSizeDecimals(ZEC_MARKET_ID, 3);

        fundedVault.setMarketSizeDecimals(BTC_MARKET_ID, 5);
        fundedVault.setMarketSizeDecimals(ETH_MARKET_ID, 3);
        fundedVault.setMarketSizeDecimals(SOL_MARKET_ID, 3);
        fundedVault.setMarketSizeDecimals(MON_MARKET_ID, 0);
        fundedVault.setMarketSizeDecimals(ZEC_MARKET_ID, 3);
    }

    function _writeDeployments(DeploymentSet memory deployments) internal {
        string memory path = "../shared/deployments.json";
        string memory json = "deployments";

        vmJson.serializeString(json, "network", "monadTestnet");
        vmJson.serializeUint(json, "chainId", DEFAULT_CHAIN_ID);
        vmJson.serializeAddress(json, "accountRegistry", deployments.accountRegistry);
        vmJson.serializeAddress(json, "ruleEngine", deployments.ruleEngine);
        vmJson.serializeAddress(json, "perplPriceAdapter", deployments.perplPriceAdapter);
        vmJson.serializeAddress(json, "examinationVault", deployments.examinationVault);
        string memory finalJson = vmJson.serializeAddress(json, "fundedVault", deployments.fundedVault);

        vmJson.writeJson(finalJson, path);
        console2.log("Wrote deployments to", path);
    }
}
