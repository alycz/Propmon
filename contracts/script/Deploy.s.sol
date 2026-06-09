// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

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

/// @notice Deployment harness stub. Downstream implementation agents replace placeholder
/// addresses with concrete deployments while preserving the fixed deployment order.
contract Deploy is Script {
    VmJson private constant vmJson = VmJson(address(uint160(uint256(keccak256("hevm cheat code")))));

    struct DeploymentSet {
        address accountRegistry;
        address ruleEngine;
        address perplPriceAdapter;
        address examinationVault;
        address fundedVault;
    }

    function run() external returns (DeploymentSet memory deployments) {
        vm.startBroadcast();

        // Fixed order:
        // 1. AccountRegistry
        // 2. RuleEngine
        // 3. PerplPriceAdapter
        // 4. ExaminationVault
        // 5. FundedVault
        //
        // Concrete constructors and role wiring are owned by Agents 01-05.
        deployments = DeploymentSet({
            accountRegistry: address(0),
            ruleEngine: address(0),
            perplPriceAdapter: address(0),
            examinationVault: address(0),
            fundedVault: address(0)
        });

        vm.stopBroadcast();
        _writeDeployments(deployments);
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
