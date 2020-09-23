# Python API integrations

## Introduction

This section contains the complete tutorial code found at https://docs.bitpost.co. For a step-by-step explanation of the code, please visit the previous link. The bitcoin python libraries that we use are:
* Bit: a very user-friendly library that we use for the vast majority of the tutorials. It connects to the network via block explorer APIs.
* Peter Todd's python-bitcoinlib: good low-level library with many respected contributors; we use it for bitcoin message signing.

We include an interface class `BitpostInterface` that wraps the API calls and makes it easier to get started. For the complete API reference, visit https://apidocs.bitpost.co.

## Running

* Install dependencies with `sudo pip install -r requirements.txt`. 
* `bit_library/send_once.py` corresponds to the [basic API integration](https://docs.bitpost.co/basic/quick-start.html) in our documentation. 
Set a private key and fund it with some bitcoin to experiment with. You don't need to wait for the transaction to be confirmed to run the script.
* `bit_library/send_multiple.py` corresponds to the [intermediate API integration](https://docs.bitpost.co/intermediate/child-requests.html).
Contrary to the previous script, this script can spend from pending RBF change.
