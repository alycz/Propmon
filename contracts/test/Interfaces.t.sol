// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccountRegistry} from "../src/interfaces/IAccountRegistry.sol";
import {IAccountView} from "../src/interfaces/IAccountView.sol";
import {IExaminationVault} from "../src/interfaces/IExaminationVault.sol";
import {IFundedVault} from "../src/interfaces/IFundedVault.sol";
import {IPerplPriceAdapter} from "../src/interfaces/IPerplPriceAdapter.sol";
import {IRuleEngine} from "../src/interfaces/IRuleEngine.sol";

contract InterfaceCompileSmokeTest {
    function testInterfacesCompile() external pure returns (bytes4, bytes4, bytes4, bytes4, bytes4, bytes4) {
        return (
            IAccountRegistry.ownerOf.selector,
            IAccountView.accountSnapshot.selector,
            IExaminationVault.buyExamination.selector,
            IFundedVault.openPositionDemo.selector,
            IPerplPriceAdapter.getPrice.selector,
            IRuleEngine.checkTrade.selector
        );
    }
}
