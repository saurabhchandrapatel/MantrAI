
try {
    console.log("Trying require('@langchain/classic/memory')...");
    // const classic = require('@langchain/classic/memory');
    // console.log("Success classic:", Object.keys(classic));
} catch (e) {
    console.log("Failed classic:", e.message);
}

try {
    console.log("Trying require('langchain/memory')...");
    // We know this fails, but let's try require('langchain').memory?
    const lc = require('langchain');
    if (lc.memory) console.log("Success lc.memory");
    else console.log("lc.memory undefined");
} catch (e) {
    console.log("Failed langchain:", e.message);
}

try {
    console.log("Trying require('langchain/chains')...");
    const chains = require('langchain/chains');
    console.log("Success chains:", Object.keys(chains).length);
} catch (e) {
    console.log("Failed chains:", e.message);
}

