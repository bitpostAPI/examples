package co.bitpost;

import com.google.common.util.concurrent.ListenableFuture;
import kong.unirest.json.JSONObject;
import org.apache.commons.codec.binary.Hex;
import org.bitcoinj.core.*;
import org.bitcoinj.net.discovery.DnsDiscovery;
import org.bitcoinj.params.MainNetParams;
import org.bitcoinj.script.Script;
import org.bitcoinj.store.BlockStore;
import org.bitcoinj.store.SPVBlockStore;
import org.bitcoinj.wallet.DeterministicSeed;
import org.bitcoinj.wallet.SendRequest;
import org.bitcoinj.wallet.Wallet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class SendOnce{

    static Logger LOGGER = LoggerFactory.getLogger(SendOnce.class);

    static long satsToSend = 1_000;
    static int maxDollarFee = 3;
    static Address destination = Address.fromString(MainNetParams.get(), "1BitcoinEaterAddressDontSendf59kuE");
    static long target = Instant.now().getEpochSecond() + 60*60; // in one hour

    static String seedCode = "your bip39 word list";
    static long walletCreation = Instant.now().minusMillis(2*24*60*60*1000).getEpochSecond();

    static boolean fetchWalletData = false;

    public static void main(String[] args) throws Exception{
        Path walletPath = Path.of(System.getProperty("user.dir"), "wallet.dat");
        File walletFile = new File(walletPath.toString());
        Path blockStorePath = Path.of(System.getProperty("user.dir"), "blockHeaders.dat");
        File blockFile = new File(blockStorePath.toString());
        Wallet wallet = getWallet(walletFile);

        if(fetchWalletData) {
            LOGGER.debug("Syncing block headers and getting UTXOs through bloom filtering. This may take some minutes on the first run... ");
            BlockStore blockStore = new SPVBlockStore(MainNetParams.get(), blockFile, 20000, true);
            BlockChain blockChain = new BlockChain(MainNetParams.get(), wallet, blockStore);
            PeerGroup peerGroup = new PeerGroup(MainNetParams.get(), blockChain);
            peerGroup.setBloomFilteringEnabled(true);
            peerGroup.addWallet(wallet);
            peerGroup.addPeerDiscovery(new DnsDiscovery(MainNetParams.get()));

            peerGroup.start();
            peerGroup.startBlockChainDownload(null);
            peerGroup.connectToLocalHost();
            peerGroup.setMaxConnections(3);
            ListenableFuture<List<Peer>> peerFuture = peerGroup.waitForPeers(3);
            LOGGER.debug("Saving block headers to file=" + blockFile.toString() + ", Peer group running=" + peerGroup.isRunning());
            peerFuture.get();

            syncBlockHeaders(blockChain, peerGroup);
            wallet.saveToFile(walletFile);
            LOGGER.info("Saved wallet to file=" + walletFile.toString());
        }

        long MAX_FEE_IN_SATS = 100_000_000*maxDollarFee/10_000; // you can easily fetch the live price
        // you should use the exact transaction size, this is not adviced for production
        long HEURISTIC_TX_SIZE = 10 + 34*2 + 90; // 2 outputs and one P2SH-P2WKH input
        double USER_MAX_FEERATE = 1.0*MAX_FEE_IN_SATS/HEURISTIC_TX_SIZE;

        BitpostInterface bitpostInterface = new BitpostInterface();
        List<Double> feerates = bitpostInterface.getFeerates(USER_MAX_FEERATE, 50);

        SendRequest srTemplate = SendRequest.to(destination, Coin.ofSat(satsToSend));
        srTemplate.setFeePerVkb(Coin.ofSat(Math.round(USER_MAX_FEERATE*1000)));
        srTemplate.shuffleOutputs = false;
        wallet.completeTx(srTemplate);

        List<String> rawTxs = new ArrayList<>();
        for(Double feerate : feerates) {
            Transaction tx = new Transaction(MainNetParams.get());
            srTemplate.tx.getInputs().forEach(tx::addInput);
            tx.getInputs().forEach(i -> i.setSequenceNumber(4294967293L));
            tx.addOutput(Coin.ofSat(satsToSend), destination);

            long newFee  =  Math.round(feerate*srTemplate.tx.getVsize());
            long feeDifference = srTemplate.tx.getFee().getValue() - newFee;
            long changeAmount = srTemplate.tx.getOutput(1).getValue().getValue() + feeDifference;
            tx.addOutput(Coin.ofSat(changeAmount), srTemplate.tx.getOutput(1).getScriptPubKey());

            SendRequest newRequest = SendRequest.forTx(tx);
            tx.getInput(0).clearScriptBytes();
            wallet.signTransaction(newRequest);
            rawTxs.add(Hex.encodeHexString(tx.bitcoinSerialize()));
        }

        BitpostRequest bitpostRequest = bitpostInterface.createBitpostRequest(rawTxs, target, 0L, false);
        JSONObject response = bitpostRequest.sendRequest();

    }

    private static void syncBlockHeaders(BlockChain blockChain, PeerGroup peerGroup) throws Exception{
        while(blockChain.getBestChainHeight() < peerGroup.getMostCommonChainHeight()) {
            Thread.sleep(10 * 1000);
            LOGGER.debug("Block store height=" + blockChain.getBestChainHeight() + ", most common chain height="
                    + peerGroup.getMostCommonChainHeight() + ", progress(%)=" + Math.round(1000.0*blockChain.getBestChainHeight()/peerGroup.getMostCommonChainHeight())/10.0 );
        }
    }

    private static Wallet getWallet(File walletFile) throws Exception{
        if(walletFile.exists()) {
            Wallet wallet = Wallet.loadFromFile(walletFile);
            LOGGER.info("Loaded wallet file");
            return wallet;
        }

        DeterministicSeed seed = new DeterministicSeed(seedCode, null, "", walletCreation);
        Wallet wallet = Wallet.fromSeed(MainNetParams.get(), seed, Script.ScriptType.P2WPKH);
        LOGGER.info("Created wallet from seed");
        return wallet;
    }
}

