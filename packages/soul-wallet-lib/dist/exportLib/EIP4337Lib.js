"use strict";
/*
 * @Description:
 * @Version: 1.0
 * @Autor: z.cejay@gmail.com
 * @Date: 2022-08-05 16:08:23
 * @LastEditors: cejay
 * @LastEditTime: 2022-09-06 12:57:09
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EIP4337Lib = void 0;
const utils_1 = require("ethers/lib/utils");
const address_1 = require("../defines/address");
const userOperation_1 = require("../entity/userOperation");
const guard_1 = require("../utils/guard");
const web3Helper_1 = require("../utils/web3Helper");
const simpleWallet_1 = require("../contracts/simpleWallet");
class EIP4337Lib {
    /**
     * get wallet code
     * @param entryPointAddress the entryPoint address
     * @param ownerAddress the owner address
     * @returns the wallet code hex string
     */
    static getWalletCode(entryPointAddress, ownerAddress) {
        guard_1.Guard.address(entryPointAddress);
        guard_1.Guard.address(ownerAddress);
        const simpleWalletBytecode = new (web3Helper_1.Web3Helper.new().web3).eth.Contract(simpleWallet_1.SimpleWalletContract.ABI).deploy({
            data: simpleWallet_1.SimpleWalletContract.bytecode,
            arguments: [
                entryPointAddress,
                ownerAddress
            ]
        }).encodeABI();
        return simpleWalletBytecode;
    }
    /**
     * calculate wallet address by owner address
     * @param entryPointAddress the entryPoint address
     * @param ownerAddress the owner address
     * @param salt the salt number,default is 0
     * @param create2Factory create2factory address defined in EIP-2470
     * @returns
     */
    static calculateWalletAddress(entryPointAddress, ownerAddress, salt = 0, create2Factory = address_1.Create2Factory) {
        return EIP4337Lib.calculateWalletAddressByCode(simpleWallet_1.SimpleWalletContract, [entryPointAddress, ownerAddress], salt, create2Factory);
    }
    /**
     * get the userOperation for active (first time) the wallet
     * @param entryPointAddress
     * @param payMasterAddress
     * @param ownerAddress
     * @param maxFeePerGas
     * @param maxPriorityFeePerGas
     * @param salt
     * @param create2Factory
     */
    static activateWalletOp(entryPointAddress, payMasterAddress, ownerAddress, maxFeePerGas, maxPriorityFeePerGas, salt = 0, create2Factory = address_1.Create2Factory) {
        const initCodeWithArgs = EIP4337Lib.getWalletCode(entryPointAddress, ownerAddress);
        const initCodeHash = (0, utils_1.keccak256)(initCodeWithArgs);
        const walletAddress = EIP4337Lib.calculateWalletAddressByCodeHash(initCodeHash, salt, create2Factory);
        let userOperation = new EIP4337Lib.UserOperation();
        userOperation.nonce = salt; //0;
        userOperation.sender = walletAddress;
        userOperation.paymaster = payMasterAddress;
        userOperation.maxFeePerGas = maxFeePerGas;
        userOperation.maxPriorityFeePerGas = maxPriorityFeePerGas;
        userOperation.initCode = initCodeWithArgs;
        userOperation.verificationGas = 100000 + 3200 + 200 * userOperation.initCode.length;
        userOperation.callGas = 0;
        userOperation.callData = "0x";
        return userOperation;
    }
    /**
     * calculate EIP-4337 wallet address
     * @param initContract the init Contract
     * @param jsonInterface the jsonInterface of the contract
     * @param initArgs the init args
     * @param salt the salt number
     * @param create2Factory create2factory address defined in EIP-2470
     * @returns
     */
    static calculateWalletAddressByCode(initContract, initArgs, salt, create2Factory = address_1.Create2Factory) {
        guard_1.Guard.hex(initContract.bytecode);
        const web3 = web3Helper_1.Web3Helper.new().web3;
        const initCodeWithArgs = new web3.eth.Contract(initContract.ABI).deploy({
            data: initContract.bytecode,
            arguments: initArgs
        }).encodeABI();
        const initCodeHash = (0, utils_1.keccak256)(initCodeWithArgs);
        return EIP4337Lib.calculateWalletAddressByCodeHash(initCodeHash, salt, create2Factory);
    }
    /**
     * calculate EIP-4337 wallet address
     * @param initCodeHash the init code after keccak256
     * @param salt the salt number
     * @param create2Factory create2factory address defined in EIP-2470
     * @returns the EIP-4337 wallet address
     */
    static calculateWalletAddressByCodeHash(initCodeHash, salt, create2Factory = address_1.Create2Factory) {
        guard_1.Guard.keccak256(initCodeHash);
        guard_1.Guard.uint(salt);
        guard_1.Guard.address(create2Factory);
        const saltBytes32 = (0, utils_1.hexZeroPad)((0, utils_1.hexlify)(salt), 32);
        return (0, utils_1.getCreate2Address)(create2Factory, saltBytes32, initCodeHash);
    }
    /**
     * get nonce number from contract wallet
     * @param walletAddress the wallet address
     * @param web3 the web3 instance
     * @param defaultBlock "earliest", "latest" and "pending"
     * @returns the next nonce number
     */
    static getNonce(walletAddress, web3, defaultBlock = 'latest') {
        return __awaiter(this, void 0, void 0, function* () {
            guard_1.Guard.address(walletAddress);
            try {
                const code = yield web3.eth.getCode(walletAddress, defaultBlock);
                // check contract is exist
                if (code === '0x') {
                    return 0;
                }
                else {
                    const contract = new web3.eth.Contract([{ "inputs": [], "name": "nonce", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }], walletAddress);
                    const nonce = yield contract.methods.nonce().call();
                    // try parse to number
                    const nextNonce = parseInt(nonce, 10);
                    if (isNaN(nextNonce)) {
                        throw new Error('nonce is not a number');
                    }
                    return nonce;
                }
            }
            catch (error) {
                throw error;
            }
        });
    }
}
exports.EIP4337Lib = EIP4337Lib;
/**
 * User Operation
 */
EIP4337Lib.UserOperation = userOperation_1.UserOperation;
EIP4337Lib.Utils = {
    getNonce: EIP4337Lib.getNonce
};
EIP4337Lib.Defines = {
    AddressZero: address_1.AddressZero,
    Create2Factory: address_1.Create2Factory
};
//# sourceMappingURL=EIP4337Lib.js.map