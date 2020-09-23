import numpy as np
from bit_library.bitpost_interface_for_bit import BipostInterfaceForBit
import bit.transaction
import bit.constants

# REPLACE WITH YOUR VALUES
destination_address = '1BitcoinEaterAddressDontSendf59kuE'
sats_to_send = 566
maximum_dollar_fee = 5
confirmation_target_hours = 1.5
private_key_bytes = b'REPLACE_WITH_YOUR_RANDOM_STRING'
################

key = bit.Key.from_bytes(private_key_bytes)

if float(key.get_balance(currency='satoshi')) < 1000:
    print('Fund your wallet first. address=' + key.segwit_address)
    exit(1)

# This is a very SUB-OPTIMAL approach just for demo purposes only, you should use the exact transaction size
MAX_FEE_IN_SATS = bit.network.currency_to_satoshi(maximum_dollar_fee, 'usd') # don't pay more than $5
HEURISTIC_TX_SIZE = 10 + 34*2 + 90 # 2 outputs and one P2SH-P2WKH input
USER_MAX_FEERATE = MAX_FEE_IN_SATS/HEURISTIC_TX_SIZE
MAX_FEERATE = int(min(USER_MAX_FEERATE, max(20, bit.network.get_fee(fast=True) * 3))) # sat/B

DEFAULT_NUMBER_TXS = 50 # create 50 transactions with different fees
feerates = [int(feerate) for feerate in np.arange(1, MAX_FEERATE, step=max(1, (MAX_FEERATE - 1) / DEFAULT_NUMBER_TXS))] # in sat/B

# select inputs
unspents = key.get_unspents()
selected_unspents, _ = bit.transaction.select_coins(sats_to_send, MAX_FEERATE, [36], min_change=566, unspents=unspents)

raw_signed_txs = []
for feerate in feerates:
    tx = key.create_transaction([(destination_address, sats_to_send, 'satoshi')], feerate, combine=True, unspents=selected_unspents, replace_by_fee=True)
    raw_signed_txs.append(tx)


bitpost_interface = BipostInterfaceForBit()
request = bitpost_interface.create_bitpost_request(raw_signed_txs, confirmation_target_hours*60, delay=0)
request.send_request()