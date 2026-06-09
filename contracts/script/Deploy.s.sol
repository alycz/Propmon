// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PerplPriceAdapter} from "../src/oracle/PerplPriceAdapter.sol";
import {AccountRegistry} from "../src/registry/AccountRegistry.sol";
import {RuleEngine} from "../src/rules/RuleEngine.sol";

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
}

/// @notice Deployment harness stub. Downstream implementation agents replace placeholder
/// addresses with concrete deployments while preserving the fixed deployment order.
contract Deploy is Script {
    VmJson private constant vmJson = VmJson(address(uint160(uint256(keccak256("hevm cheat code")))));
    VmEnv private constant vmEnv = VmEnv(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct DeploymentSet {
        address accountRegistry;
        address ruleEngine;
        address perplPriceAdapter;
        address examinationVault;
        address fundedVault;
    }

    function run() external returns (DeploymentSet memory deployments) {
        address deployer = _envAddressOr("OWNER_ADDRESS", msg.sender);
        address relayer = _envAddressOr("RELAYER_ADDRESS", deployer);

        vm.startBroadcast();

        // Fixed order:
        // 1. AccountRegistry
        // 2. RuleEngine
        // 3. PerplPriceAdapter
        // 4. ExaminationVault
        // 5. FundedVault
        //
        AccountRegistry accountRegistry = new AccountRegistry(deployer);
        RuleEngine ruleEngine = new RuleEngine(deployer);
        PerplPriceAdapter perplPriceAdapter = new PerplPriceAdapter(deployer, relayer);

        address examinationVault = _envAddressOr("EXAMINATION_VAULT_ADDRESS", address(0));
        address fundedVault = _envAddressOr("FUNDED_VAULT_ADDRESS", address(0));
        if (examinationVault != address(0)) {
            accountRegistry.grantRole(accountRegistry.VAULT_ROLE(), examinationVault);
            ruleEngine.grantRole(ruleEngine.ACCOUNT_CONFIG_ROLE(), examinationVault);
        }
        if (fundedVault != address(0)) {
            accountRegistry.grantRole(accountRegistry.VAULT_ROLE(), fundedVault);
            ruleEngine.grantRole(ruleEngine.ACCOUNT_CONFIG_ROLE(), fundedVault);
        }

        // Concrete vault constructors and remaining role wiring are owned by Agents 02 and 04.
        deployments = DeploymentSet({
            accountRegistry: address(accountRegistry),
            ruleEngine: address(ruleEngine),
            perplPriceAdapter: address(perplPriceAdapter),
            examinationVault: examinationVault,
            fundedVault: fundedVault
        });

        vm.stopBroadcast();
        console2.log("AccountRegistry", address(accountRegistry));
        console2.log("RuleEngine", address(ruleEngine));
        console2.log("PerplPriceAdapter", address(perplPriceAdapter));
        console2.log("Relayer", relayer);
        _writeDeployments(deployments);
    }

    function _envAddressOr(string memory key, address defaultValue) internal returns (address) {
        try vmEnv.envAddress(key) returns (address value) {
            return value;
        } catch {
            return defaultValue;
        }
    }

    function _writeDeployments(DeploymentSet memory deployments) internal {
        string memory path = "../shared/deployments.json";
        string memory json = "deployments";

        vmJson.serializeString(json, "network", "monadTestnet");
        vmJson.serializeUint(json, "chainId", 10143);
        vmJson.serializeAddress(json, "accountRegistry", deployments.accountRegistry);
        vmJson.serializeAddress(json, "ruleEngine", deployments.ruleEngine);
        vmJson.serializeAddress(json, "perplPriceAdapter", deployments.perplPriceAdapter);
        vmJson.serializeAddress(json, "examinationVault", deployments.examinationVault);
        string memory finalJson = vmJson.serializeAddress(json, "fundedVault", deployments.fundedVault);

        vmJson.writeJson(finalJson, path);
        console2.log("Wrote deployments to", path);
    }
}
