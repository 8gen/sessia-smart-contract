module.exports = {
    deploy: [
        'Presale', 'Sale'
    ],
    networks: {
        local: {
            host: 'localhost',
            port: 8545,
            network_id: '*',
        }
    },
    solc: {
        optimizer: { // settings compile
            enabled: true,
            runs: 200
        }
    },
    build: 'webpack'
};
