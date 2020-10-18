import bitcoin = require("bitcoinjs-lib");
import coinSelect = require("coinselect");
import bip32 = require("bip32");
import bip39 = require("bip39");
const request = require("sync-request");
import {BitpostInterfaceForBitcoinJS, BitpostRequest} from "bitpost"

// input ---------------------------------------------
const maxDollarFee: number = 3
const destinationAddress: string = '1BitcoinEaterAddressDontSendf59kuE';
const satsToSend: number = 566;
const confirmation_target_seconds = Math.round(Date.now()/1000) + 60 * 60  // eg. in one hour
let mnemonicSeed: string = 'your bip39 word list'
// ----------------------------------------------------

let seed = bip39.mnemonicToSeedSync(mnemonicSeed)
let master: bip32.BIP32Interface = bip32.fromSeed(seed, bitcoin.networks.bitcoin);
let mainKey: bip32.BIP32Interface = master.derivePath(`m/84'/0'/0'/0/0`); 
let changeKey: bip32.BIP32Interface = master.derivePath(`m/84'/0'/0'/1/0`);
let mainAddress = bitcoin.payments.p2wpkh({ pubkey: mainKey.publicKey, network: bitcoin.networks.bitcoin});
let changeAddress = bitcoin.payments.p2wpkh({ pubkey: changeKey.publicKey, network: bitcoin.networks.bitcoin });

let bitpostInterface: BitpostInterfaceForBitcoinJS = new BitpostInterfaceForBitcoinJS({})

interface TxInput{txId: string, vout: number, value: number, witnessUtxo: WitnessUtxo}
function getUtxosFromAddress(address: string): Array<TxInput>{
  var resp = request('GET', 'https://blockstream.info/api/address/' + address + '/utxo');
  let utxosRaw = JSON.parse(resp.getBody('utf-8'));
  return utxosRaw.map(utxo => {utxos.push({
    txId: utxo.txid,
    vout: utxo.vout,
    value: utxo.value,
    witnessUtxo: {
      script: bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin),
      value: utxo.value
    }
  })})
}
let utxos: Array<TxInput> = []
utxos.concat(getUtxosFromAddress(mainAddress.address))
utxos.concat(getUtxosFromAddress(changeAddress.address))

const BTC_PRICE_USD: number = 10_000 //can be easily fetched through an API
const MAX_FEE_IN_SATS: number = 100_000_000*maxDollarFee/BTC_PRICE_USD
// you should use the exact transaction size, this is not adviced for production
const HEURISTIC_TX_SIZE = 10 + 34*2 + 68 // 2 outputs and one segwit input
const USER_MAX_FEERATE = MAX_FEE_IN_SATS/HEURISTIC_TX_SIZE

const balance: number = utxos.map(i => i.value).reduce((x,y)=>x+y)
if(balance < satsToSend+MAX_FEE_IN_SATS) throw "Insufficient balance."

let payees = [{address: destinationAddress, value: satsToSend}]
let { inputs, outputs, _ } = coinSelect(utxos, payees, Math.round(USER_MAX_FEERATE*2/3))


interface TxOutput{address: string, value: number, network: bitcoin.Network}
interface WitnessUtxo{script: Buffer, value: number}

function make_transaction(inputs: Array<TxInput>, outputs: Array<TxOutput>, targetFeerate?: number, txSize?: number): bitcoin.Psbt {
  if(Boolean(targetFeerate) !== Boolean(txSize)) throw "TargetFeerate and txSize arguments must be both provided or left in blank."
  
  let tx: bitcoin.Psbt = new bitcoin.Psbt();
  if(targetFeerate){
    tx.setMaximumFeeRate(targetFeerate + 1);
  }
  let initialFee = 0;

  inputs.forEach(input => {
    initialFee += input.value
    tx.addInput({
      hash: input.txId,
      index: input.vout,
      sequence: 0xfffffffd,
      witnessUtxo: {
        script: input.witnessUtxo.script,
        value: input.witnessUtxo.value,
      },
    });
  });
  
  outputs.forEach(o => initialFee -= o.value)

  outputs.forEach(output => {
    if(!output.address && targetFeerate){
      const adjustedChange: number = output.value + initialFee - txSize*targetFeerate 
      tx.addOutput({address: changeAddress.address, value: adjustedChange})
    } else if (!output.address) {
      tx.addOutput({address: changeAddress.address, value: output.value})
    } else {
      tx.addOutput({address: output.address, value: output.value})
    }
}
  )
  
  for(let i=0; i < inputs.length; i++){
    try{
      tx.signInput(i, mainKey);
    }catch{}
    try{
      tx.signInput(i, changeKey);
    }catch{}
  }
  
  tx.validateSignaturesOfAllInputs();
  tx.finalizeAllInputs();
  return tx;
}

let preliminary_tx: bitcoin.Psbt = make_transaction(inputs, outputs);
let txSize: number = preliminary_tx.extractTransaction().virtualSize();

let feerates: Array<number> = bitpostInterface.getFeerates({maxFeerate: USER_MAX_FEERATE})

let rawTxs: Array<string> = []
for(const feerate of feerates){
  let final_tx = make_transaction(inputs, outputs, feerate, txSize);
  rawTxs.push(final_tx.extractTransaction().toHex())
}


const delay = 0
let bitpostRequest: BitpostRequest = bitpostInterface.createBitpostRequest(
                                      rawTxs, confirmation_target_seconds, delay)
let response = bitpostRequest.sendRequest()