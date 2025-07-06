import {
  Client as CarrotHttpClient,
  Common,
} from "@carrot-protocol/http-client";
import {
  CARROT_API_URL,
  CRT_MINT,
  CRT_MINT_DECIMALS,
  CRT_VAULT_ADDRESS,
  USDC_MINT,
} from "./config.js";
import anchorPkg from "@coral-xyz/anchor";
import { logger } from "./utils.js";
const { BN, web3 } = anchorPkg;

export class CrtClient {
  private carrotClient: CarrotHttpClient;

  constructor() {
    this.carrotClient = new CarrotHttpClient(CARROT_API_URL);
  }

  // get the current APY for the CRT vault
  // returns a string with the APY formatted as a percentage
  async getCrtApy(): Promise<string> {
    const performanceData = await this.carrotClient.getVaultPerformance(
      CRT_VAULT_ADDRESS,
      true,
    );
    const apy = performanceData.apy;

    if (isNaN(apy)) {
      throw new Error("Invalid APY format received from API.");
    }

    const apyFmt = `${apy.toFixed(2)}%`;
    return apyFmt;
  }

  // sends a signed tx to the Carrot API for tx land on solana
  async sendTx(signedBase64Tx: string): Promise<string> {
    const txSig = await this.carrotClient.sendSignedTx(signedBase64Tx);
    return txSig;
  }

  async getUnsignedIssueTx(
    uiAmount: number,
    issueArgs: { selectedMint?: string; issueAll?: boolean },
    assetMintStr: string, // usdc for now
    walletStr: string,
  ): Promise<string> {
    const assetMint = new web3.PublicKey(assetMintStr);
    const wallet = new web3.PublicKey(walletStr);

    let usdcAmountUi = uiAmount;
    const issueAll = issueArgs.issueAll ?? false;
    if (!issueAll && issueArgs.selectedMint === CRT_MINT.toString()) {
      // if amount is in crt, we need to convert it to usdc
      const vault = await this.carrotClient.getVault(CRT_VAULT_ADDRESS, true);
      usdcAmountUi = vault.navPostFee * uiAmount;
      logger.info("converting crt to usdc", {
        crtAmountUi: uiAmount,
        usdcAmountUi,
      });
    }

    if (issueAll) {
      // fetch user token data from carrot api
      const userResponse = await this.carrotClient.getUser(
        CRT_VAULT_ADDRESS,
        wallet,
      );
      usdcAmountUi =
        userResponse.assets.find((a) => a.mint.equals(assetMint))?.amountUi ??
        0;
    }

    // setup the params
    const amount = Common.uiToAmount(usdcAmountUi, 6);
    if (amount.lte(new BN(0))) {
      throw new Error("amount must be > 0");
    }

    const response = await this.carrotClient.prepareIssue(
      CRT_VAULT_ADDRESS,
      assetMint,
      amount,
      wallet,
    );

    return response.tx;
  }

  async getUnsignedRedeemTx(
    uiAmount: number,
    redeemArgs: {
      selectedMint?: string;
      redeemAll?: boolean;
    },
    assetMintStr: string,
    walletStr: string,
  ): Promise<string> {
    // parse inputs
    const assetMint = new web3.PublicKey(assetMintStr);
    const wallet = new web3.PublicKey(walletStr);

    let crtAmountUi = uiAmount;
    const redeemAll = redeemArgs.redeemAll ?? false;
    if (!redeemAll && redeemArgs.selectedMint === USDC_MINT.toString()) {
      // if amount is in usdc, we need to convert it to crt
      const vault = await this.carrotClient.getVault(CRT_VAULT_ADDRESS, true);
      crtAmountUi = vault.navPostFee * uiAmount;
      logger.info("converted usdc to crt", {
        usdcAmountUi: uiAmount,
        crtAmountUi,
      });
    }

    // if redeeming all, we need to get the balance of the wallet's CRT token account
    if (redeemAll) {
      // fetch user token data from carrot api
      const userResponse = await this.carrotClient.getUser(
        CRT_VAULT_ADDRESS,
        wallet,
      );
      crtAmountUi = userResponse.sharesAmountUi;

      logger.info("redeeming all crt", {
        crtAmountUi,
      });
    }

    // convert to integer amount
    const amount = Common.uiToAmount(crtAmountUi, CRT_MINT_DECIMALS);
    if (amount.lte(new BN(0))) {
      throw new Error("amount must be > 0");
    }

    const response = await this.carrotClient.prepareRedeem(
      CRT_VAULT_ADDRESS,
      assetMint,
      amount,
      wallet,
    );

    return response.tx;
  }
}
