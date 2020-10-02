import numpy as np
import datetime as dt
from bitpost.interface import BitpostInterface
from bitpost.interface_for_bit import BitpostInterfaceForBit
import bit.transaction
import bit.constants

# REPLACE WITH YOUR VALUES
destination_address = '1BitcoinEaterAddressDontSendf59kuE'
sats_to_send = 566
maximum_dollar_fee = 5 # don't pay more than $5
confirmation_target_seconds = round(dt.datetime.now().timestamp()) + 60 * 60  # eg. in one hour
private_key_bytes = b'fenistil-fiskars-wd-lenovo'
################

key = bit.Key.from_bytes(private_key_bytes)

if float(key.get_balance(currency='satoshi')) < 1000:
    print('Fund your wallet first. address=' + key.segwit_address)
    exit(1)

# This is a very SUB-OPTIMAL approach just for demo purposes only, you should use the exact transaction size
MAX_FEE_IN_SATS = bit.network.currency_to_satoshi(maximum_dollar_fee, 'usd')
HEURISTIC_TX_SIZE = 10 + 34*2 + 90 # 2 outputs and one P2SH-P2WKH input
USER_MAX_FEERATE = MAX_FEE_IN_SATS/HEURISTIC_TX_SIZE

feerates = BitpostInterfaceForBit.get_feerates(USER_MAX_FEERATE, size=50, target=confirmation_target_seconds)

# select inputs
unspents = key.get_unspents()
selected_unspents, _ = bit.transaction.select_coins(sats_to_send, max(feerates), [36], min_change=566, unspents=unspents)

raw_signed_txs = []
for feerate in feerates:
    tx = key.create_transaction([(destination_address, sats_to_send, 'satoshi')], feerate, combine=True, unspents=selected_unspents, replace_by_fee=True)
    raw_signed_txs.append(tx)


bitpost_interface = BitpostInterface()
request = bitpost_interface.create_bitpost_request(raw_signed_txs, confirmation_target_seconds, delay=0)
request.send_request()