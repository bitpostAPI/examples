"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var bitcoin = require("bitcoinjs-lib");
var coinSelect = require("coinselect");
var bip32 = require("bip32");
var bip39 = require("bip39");
var request = require("sync-request");
var bitpost_1 = require("bitpost");
// input ---------------------------------------------
var maxDollarFee = 3;
var destinationAddress = '1BitcoinEaterAddressDontSendf59kuE';
var satsToSend = 566;
var confirmation_target_seconds = Math.round(Date.now() / 1000) + 60 * 60; // eg. in one hour
var mnemonicSeed = 'your bip39 word list';
// ----------------------------------------------------
var seed = bip39.mnemonicToSeedSync(mnemonicSeed);
var master = bip32.fromSeed(seed, bitcoin.networks.bitcoin);
var mainKey = master.derivePath("m/84'/0'/0'/0/0");
var changeKey = master.derivePath("m/84'/0'/0'/1/0");
var mainAddress = bitcoin.payments.p2wpkh({ pubkey: mainKey.publicKey, network: bitcoin.networks.bitcoin });
var changeAddress = bitcoin.payments.p2wpkh({ pubkey: changeKey.publicKey, network: bitcoin.networks.bitcoin });
var bitpostInterface = new bitpost_1.BitpostInterfaceForBitcoinJS({});
function getUtxosFromAddress(address) {
    var resp = request('GET', 'https://blockstream.info/api/address/' + address + '/utxo');
    var utxosRaw = JSON.parse(resp.getBody('utf-8'));
    return utxosRaw.map(function (utxo) {
        utxos.push({
            txId: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
            witnessUtxo: {
                script: bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin),
                value: utxo.value
            }
        });
    });
}
var utxos = [];
utxos.concat(getUtxosFromAddress(mainAddress.address));
utxos.concat(getUtxosFromAddress(changeAddress.address));
var BTC_PRICE_USD = 10000; //can be easily fetched through an API
var MAX_FEE_IN_SATS = 100000000 * maxDollarFee / BTC_PRICE_USD;
// you should use the exact transaction size, this is not adviced for production
var HEURISTIC_TX_SIZE = 10 + 34 * 2 + 68; // 2 outputs and one segwit input
var USER_MAX_FEERATE = MAX_FEE_IN_SATS / HEURISTIC_TX_SIZE;
var balance = utxos.map(function (i) { return i.value; }).reduce(function (x, y) { return x + y; });
if (balance < satsToSend + MAX_FEE_IN_SATS)
    throw "Insufficient balance.";
var payees = [{ address: destinationAddress, value: satsToSend }];
var _a = coinSelect(utxos, payees, Math.round(USER_MAX_FEERATE * 2 / 3)), inputs = _a.inputs, outputs = _a.outputs, _ = _a._;
function make_transaction(inputs, outputs, targetFeerate, txSize) {
    if (Boolean(targetFeerate) !== Boolean(txSize))
        throw "TargetFeerate and txSize arguments must be both provided or left in blank.";
    var tx = new bitcoin.Psbt();
    if (targetFeerate) {
        tx.setMaximumFeeRate(targetFeerate + 1);
    }
    var initialFee = 0;
    inputs.forEach(function (input) {
        initialFee += input.value;
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
    outputs.forEach(function (o) { return initialFee -= o.value; });
    outputs.forEach(function (output) {
        if (!output.address && targetFeerate) {
            var adjustedChange = output.value + initialFee - txSize * targetFeerate;
            tx.addOutput({ address: changeAddress.address, value: adjustedChange });
        }
        else if (!output.address) {
            tx.addOutput({ address: changeAddress.address, value: output.value });
        }
        else {
            tx.addOutput({ address: output.address, value: output.value });
        }
    });
    for (var i = 0; i < inputs.length; i++) {
        try {
            tx.signInput(i, mainKey);
        }
        catch (_a) { }
        try {
            tx.signInput(i, changeKey);
        }
        catch (_b) { }
    }
    tx.validateSignaturesOfAllInputs();
    tx.finalizeAllInputs();
    return tx;
}
var preliminary_tx = make_transaction(inputs, outputs);
var txSize = preliminary_tx.extractTransaction().virtualSize();
var feerates = bitpostInterface.getFeerates({ maxFeerate: USER_MAX_FEERATE });
var rawTxs = [];
for (var _i = 0, feerates_1 = feerates; _i < feerates_1.length; _i++) {
    var feerate = feerates_1[_i];
    var final_tx = make_transaction(inputs, outputs, feerate, txSize);
    rawTxs.push(final_tx.extractTransaction().toHex());
}
var delay = 0;
var bitpostRequest = bitpostInterface.createBitpostRequest(rawTxs, confirmation_target_seconds, delay);
var response = bitpostRequest.sendRequest();
//# sourceMappingURL=send-once.js.map