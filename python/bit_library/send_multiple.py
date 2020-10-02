import bit
from bit.transaction import select_coins

# https://github.com/petertodd/python-bitcoinlib
from bitcoin.signmessage import SignMessage, BitcoinMessage
from bitcoin.wallet import CBitcoinSecret
from bitcoin.core import x

from bitpost.interface_for_bit import BitpostInterfaceForBit

import numpy as np
from binascii import hexlify
import hashlib
import time

# This script sends one payment with amount 'sats_to_send' to the destination address below (like send_once.py)...
# but is able to spend from pending RBF change that might be replaced.

# REPLACE WITH YOUR VALUES
destination_address = '1BitcoinEaterAddressDontSendf59kuE'
sats_to_send = 566
maximum_dollar_fee = 5
confirmation_target_seconds = round(time.time()) + 60 * 60  # eg. in one hour
private_key_bytes = b'REPLACE_WITH_YOUR_RANDOM_STRING'
##########################


def generate_wallettoken(master_pubkey):
    pubkey_hash = hashlib.new('ripemd160', hashlib.sha256(master_pubkey).digest())  # aka HASH160
    return hexlify(pubkey_hash.digest()).decode()


def retrieve_wallettoken(bit_key):
    bitcoinlib_key = CBitcoinSecret.from_secret_bytes(x(bit_key.to_hex()))
    pub_key_hex = str(bitcoinlib_key.pub.hex())

    message = "bitpost" + str(round(time.time() / 1000))  # we add a timestamp to make the proof valid for only ~ 1h
    sig = SignMessage(bitcoinlib_key, BitcoinMessage(message))
    return BitpostInterfaceForBit.get_wallettoken(pub_key_hex, sig)


key = bit.Key.from_bytes(private_key_bytes)

wallettoken = retrieve_wallettoken(key)
if wallettoken is None:
    wallettoken = generate_wallettoken(key.public_key)

bitpost_interface = BitpostInterfaceForBit(wallettoken=wallettoken, pubkey_hex=key.pub_to_hex())

MAX_FEE_IN_SATS = bit.network.currency_to_satoshi(maximum_dollar_fee, 'usd')
HEURISTIC_TX_SIZE = 10 + 34*2 + 90 # 2 outputs and one P2SH-P2WKH input
USER_MAX_FEERATE = MAX_FEE_IN_SATS/HEURISTIC_TX_SIZE
feerates = BitpostInterfaceForBit.get_feerates(USER_MAX_FEERATE, size=50, target=confirmation_target_seconds)

unspents = key.get_unspents()
used_utxos = bitpost_interface.get_utxos_used_by_bitpost()
unspents = [utxo for utxo in unspents if {'txid': utxo.txid, 'vout':utxo.txindex} not in used_utxos and utxo.confirmations > 0]

stripped_balance = 0
for unspent in unspents:
    stripped_balance += unspent.amount


def rbf_coin_select(utxos_answer, required_change, few_broadcasts=100, max_groupsize=4):
    for reqgroup in utxos_answer:
        if reqgroup['groupsize'] >= max_groupsize:
            continue
        for req in reqgroup['change']:
            if req['broadcasts'] >= few_broadcasts or req['minamount']*100_000_000 < required_change: continue
            return req['utxos'], req['minamount']*100_000_000
    return [[]], 0


sats_required_from_rbf = sats_to_send - stripped_balance + max(feerates) + 566
all_rbf_change = bitpost_interface.get_change_utxos_from_bitpost()
rbf_selected, min_rbf_sats = rbf_coin_select(all_rbf_change, sats_required_from_rbf)

selected_unspents = []
if not min_rbf_sats > sats_to_send + max(feerates) + 566 and stripped_balance > 0:
    selected_unspents = select_coins(sats_to_send - min_rbf_sats, max(feerates), [34], min_change=566, unspents=unspents)
    selected_unspents = selected_unspents[0]
elif min_rbf_sats < sats_required_from_rbf:
    print("Not enough balance. Fund wallet: address=" + key.segwit_address)
    exit(0)

raw_signed_txs = []
for pre_selection in rbf_selected:
    coin_selection = pre_selection + selected_unspents
    for i in range(0, len(feerates)):
        tx = key.create_transaction([(destination_address, sats_to_send, 'satoshi')], feerates[i], combine=True, unspents=coin_selection, replace_by_fee=True)
        raw_signed_txs.append(tx)

request = bitpost_interface.create_bitpost_request(raw_signed_txs, confirmation_target_seconds, delay=0)
request.send_request()