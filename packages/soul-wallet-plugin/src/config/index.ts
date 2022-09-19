import IconETH from "@src/assets/tokens/eth.svg";
import IconUSDC from "@src/assets/tokens/usdc.png";
import IconUSDT from "@src/assets/tokens/usdt.png";

export const assetsList = [
    {
        icon: IconETH,
        symbol: "ETH",
        balance: "28.1937",
    },
    {
        icon: IconUSDC,
        symbol: "USDC",
        balance: "100.6913",
    },
    {
        icon: IconUSDT,
        symbol: "USDT",
        balance: "73.9712",
    },
];

export default {
    walletName: "Soul Wallet",
    safeCenterURL: "https://google.com",
    backendURL:
        "http://soulwalletbackend-env.eba-zevy322d.us-west-2.elasticbeanstalk.com",
};
