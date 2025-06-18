import {
  Client as CarrotHttpClient,
  Common,
} from "@carrot-protocol/http-client";
import { CARROT_API_URL, CRT_VAULT_ADDRESS } from "./config.js";
import anchorPkg from "@coral-xyz/anchor";
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
    assetMintStr: string,
    walletStr: string,
  ): Promise<string> {
    // setup the params
    const amount = Common.uiToAmount(uiAmount, 6);
    if (amount.lte(new BN(0))) {
      throw new Error("amount must be > 0");
    }

    const assetMint = new web3.PublicKey(assetMintStr);
    const wallet = new web3.PublicKey(walletStr);

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
    assetMintStr: string,
    walletStr: string,
  ): Promise<string> {
    // setup the params
    const amount = Common.uiToAmount(uiAmount, 6);
    if (amount.lte(new BN(0))) {
      throw new Error("amount must be > 0");
    }

    const assetMint = new web3.PublicKey(assetMintStr);
    const wallet = new web3.PublicKey(walletStr);

    const response = await this.carrotClient.prepareRedeem(
      CRT_VAULT_ADDRESS,
      assetMint,
      amount,
      wallet,
    );

    return response.tx;
  }
}
