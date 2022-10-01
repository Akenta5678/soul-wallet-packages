import React, { createContext, useState, useEffect } from "react";
import { WalletLib } from "soul-wallet-lib";
import Web3 from "web3";
import api from "@src/lib/api";
import { Utils } from "@src/Utils";
import config from "@src/config";
import BN from "bignumber.js";
import KeyStore from "@src/lib/keystore";
import EntryPointABI from "../contract/abi/EntryPoint.json";
import { getLocalStorage } from "@src/lib/tools";

// init global instances
const keyStore = KeyStore.getInstance();
const web3 = new Web3(config.provider);

interface IWalletContext {
    web3: Web3;
    account: string;
    // eoa, contract
    walletType: string;
    walletAddress: string;
    getWalletAddress: () => Promise<void>;
    getWalletType: () => Promise<void>;
    getEthBalance: () => Promise<string>;
    generateWalletAddress: (val: string) => string;
    getGasPrice: () => Promise<number>;
    activateWallet: () => Promise<void>;
    addGuardian: (guardianAddress: string) => Promise<void>;
    getRecoverId: (newOwner: string) => Promise<object>;
    recoverWallet: (newOwner: string, signatures: string[]) => Promise<void>;
    deleteWallet: () => Promise<void>;
    sendErc20: (
        tokenAddress: string,
        to: string,
        amount: string,
    ) => Promise<void>;
    sendEth: (to: string, amount: string) => Promise<void>;
    replaceAddress: () => Promise<void>;
}

export const WalletContext = createContext<IWalletContext>({
    web3,
    account: "",
    walletType: "",
    walletAddress: "",
    getWalletAddress: async () => {},
    getWalletType: async () => {},
    getEthBalance: async () => {
        return "";
    },
    addGuardian: async () => {},
    getRecoverId: async () => {
        return {};
    },
    recoverWallet: async () => {},
    generateWalletAddress: () => {
        return "";
    },
    getGasPrice: async () => {
        return 0;
    },
    activateWallet: async () => {},
    deleteWallet: async () => {},
    sendErc20: async () => {},
    sendEth: async () => {},
    replaceAddress: async () => {},
});

export const WalletContextProvider = ({ children }: any) => {
    const [account, setAccount] = useState<string>("");
    const [walletAddress, setWalletAddress] = useState<string>("");
    const [walletType, setWalletType] = useState<string>("");

    const getEthBalance = async () => {
        const res = await web3.eth.getBalance(walletAddress);
        return new BN(res).shiftedBy(-18).toString();
    };

    const getGasPrice = async () => {
        return 5 * 10 ** 9;
        // return Number(await web3.eth.getGasPrice());
    };

    const getAccount = async () => {
        const res = await keyStore.getAddress();
        setAccount(res);
    };

    const generateWalletAddress = (address: string) => {
        const walletAddress = WalletLib.EIP4337.calculateWalletAddress(
            config.contracts.entryPoint,
            address,
            config.contracts.weth,
            config.contracts.paymaster,
            config.defaultSalt,
        );

        console.log("generated wallet address", walletAddress);
        return walletAddress;
    };

    const getWalletAddress = async () => {
        const res: any = await api.account.getWalletAddress({
            key: account,
        });
        console.log('get wallet address', res)
        setWalletAddress(res.data.wallet_address);
    };

    const getWalletType = async () => {
        const contractCode = await web3.eth.getCode(walletAddress);
        setWalletType(contractCode !== "0x" ? "contract" : "eoa");
    };

    const executeOperation = async (operation: any) => {
        const requestId = operation.getRequestId(
            config.contracts.entryPoint,
            config.chainId,
        );

        const signature = await keyStore.sign(requestId);

        if (signature) {
            operation.signWithSignature(account, signature || "");

            await Utils.sendOPWait(
                web3,
                operation,
                config.contracts.entryPoint,
                config.chainId,
            );
        }
    };

    const deleteWallet = async () => {
        await keyStore.delete();
    };

    const replaceAddress = async () => {
        await keyStore.replaceAddress();
    };

    const activateWallet = async () => {
        const currentFee = (await getGasPrice()) * config.feeMultiplier;
        const activateOp = WalletLib.EIP4337.activateWalletOp(
            config.contracts.entryPoint,
            config.contracts.paymaster,
            account,
            config.contracts.weth,
            currentFee,
            config.defaultTip,
            config.defaultSalt,
        );

        await executeOperation(activateOp);
    };

    const recoverWallet = async (newOwner: string, signatures: string[]) => {
        const { requestId, recoveryOp } = await getRecoverId(newOwner);

        const entryPointContract = new web3.eth.Contract(
            EntryPointABI,
            config.contracts.entryPoint,
        );

        const signPack =
            await WalletLib.EIP4337.Guaridian.packGuardiansSignByRequestId(
                requestId,
                signatures,
                walletAddress,
                web3 as any,
            );

        console.log("after sign pack", signPack);

        recoveryOp.signature = signPack;

        const result = await entryPointContract.methods
            .simulateValidation(recoveryOp)
            .call({
                from: WalletLib.EIP4337.Defines.AddressZero,
            });
        console.log(`recoverOp simulateValidation result:`, result);

        // recovery now
        await Utils.sendOPWait(
            web3,
            recoveryOp,
            config.contracts.entryPoint,
            config.chainId,
        );
    };

    const addGuardian = async (guardianAddress: string) => {
        const currentFee = (await getGasPrice()) * config.feeMultiplier;
        const nonce = await WalletLib.EIP4337.Utils.getNonce(
            walletAddress,
            web3,
        );
        const addGuardianOp =
            await WalletLib.EIP4337.Guaridian.grantGuardianRequest(
                web3 as any,
                walletAddress,
                nonce,
                guardianAddress,
                config.contracts.entryPoint,
                config.contracts.paymaster,
                currentFee,
                config.defaultTip,
            );
        if (!addGuardianOp) {
            throw new Error("addGuardianOp is null");
        }
        await executeOperation(addGuardianOp);
    };

    const getRecoverId = async (newOwner: string) => {
        let nonce = await WalletLib.EIP4337.Utils.getNonce(walletAddress, web3);
        const currentFee = (await getGasPrice()) * config.feeMultiplier;

        const recoveryOp = await WalletLib.EIP4337.Guaridian.transferOwner(
            web3 as any,
            walletAddress,
            nonce,
            config.contracts.entryPoint,
            config.contracts.paymaster,
            currentFee,
            config.defaultTip,
            newOwner,
        );
        if (!recoveryOp) {
            throw new Error("recoveryOp is null");
        }
        // get requestId
        const requestId = recoveryOp.getRequestId(
            config.contracts.entryPoint,
            config.chainId,
        );

        return { requestId, recoveryOp };
    };

    const sendEth = async (to: string, amount: string) => {
        const currentFee = (await getGasPrice()) * config.feeMultiplier;
        const amountInWei = new BN(amount).shiftedBy(18).toString();
        const nonce = await WalletLib.EIP4337.Utils.getNonce(
            walletAddress,
            web3,
        );
        const op = await WalletLib.EIP4337.Tokens.ETH.transfer(
            web3,
            walletAddress,
            nonce,
            config.contracts.entryPoint,
            config.contracts.paymaster,
            currentFee,
            config.defaultTip,
            to,
            amountInWei,
        );

        await executeOperation(op);
    };

    const sendErc20 = async (
        tokenAddress: string,
        to: string,
        amount: string,
    ) => {
        const currentFee = (await getGasPrice()) * config.feeMultiplier;
        const amountInWei = new BN(amount).shiftedBy(18).toString();
        const nonce = await WalletLib.EIP4337.Utils.getNonce(
            walletAddress,
            web3,
        );
        const op = await WalletLib.EIP4337.Tokens.ERC20.transfer(
            web3,
            walletAddress,
            nonce,
            config.contracts.entryPoint,
            config.contracts.paymaster,
            currentFee,
            config.defaultTip,
            tokenAddress,
            to,
            amountInWei,
        );
        await executeOperation(op);
    };

    useEffect(() => {
        if (!account) {
            return;
        }
        getWalletAddress();
    }, [account]);

    useEffect(() => {
        if (!walletAddress) {
            return;
        }
        getWalletType();
    }, [walletAddress]);

    useEffect(() => {
        getAccount();
    }, []);

    return (
        <WalletContext.Provider
            value={{
                web3,
                account,
                walletType,
                walletAddress,
                getWalletAddress,
                getRecoverId,
                recoverWallet,
                addGuardian,
                getWalletType,
                getEthBalance,
                generateWalletAddress,
                getGasPrice,
                activateWallet,
                deleteWallet,
                sendErc20,
                sendEth,
                replaceAddress,
            }}
        >
            {children}
        </WalletContext.Provider>
    );
};

export const WalletContextConsumer = WalletContext.Consumer;
