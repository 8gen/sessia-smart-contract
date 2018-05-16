compile: deps
	@./node_modules/.bin/truffle --network local compile
	@solidity_flattener --solc-paths=zeppelin-solidity=$(shell pwd)/node_modules/zeppelin-solidity/ contracts/SessiaCrowdsale.sol | sed 's|^pragma solidity \^0.4.13|pragma solidity \^0.4.18|g' > build/CombinedCrowdsale.sol
	@solc zeppelin-solidity=$(shell pwd)/node_modules/zeppelin-solidity/ contracts/SessiaToken.sol  --abi  2>/dev/null| grep :SessiaToken -A2 | tail -n1 | python -m json.tool > build/SessiaToken.abi
	@solc zeppelin-solidity=$(shell pwd)/node_modules/zeppelin-solidity/ contracts/SessiaCrowdsale.sol  --abi  2>/dev/null| grep :SessiaCrowdsale -A2 | tail -n1 | python -m json.tool > build/SessiaCrowdsale.abi

node_modules:
	npm install

deps: node_modules
	@pip3 install solidity_flattener -q
	
test: node_modules
	@./node_modules/.bin/truffle --network local test tests/sale.js

testrpc:
	./node_modules/.bin/testrpc \
		--account="0x9619b0ffe5edcff6a5c2a891993fce4611e5a0aa4bb22181e280b814485d6d1e, 10000000000000000000000000000000000" \
		--account="0x1b946395c51fe03f424628ba2f1d4d426af414e8347011f3a2538893ac2bd29e, 10000000000000000000000000000000000" \
		--account="0x3eadb801ab98b57296c818fdcdd2bb56ebff20e4e589e273f5e9cf270e534223, 10000000000000000000000000000000000" \
		--account="0xc71b8947f33644b45b99aa397397eb4037017a50abfeb634c2e298873add5d8e, 10000000000000000000000000000000000" \
		--account="0x31ef44e011a2dcccef8558557b54cb1e7fffe46c567322d8eb29c1ef5ac6f194, 10000000000000000000000000000000000" \
		--account="0xabe1b754554742161bca9b0ac0f8f900089d7b49c7dc0b38a651ff1d667086c7, 1" \
		--account="0x49cd18ac217610295c32e27ae3442a93e02691854056c1628cf00d0adc58ca1a, 1" \
		--account="0xf84a7395283116be53846c4c3ccdd91608a20bba857b8322b9593e2c33ebbe2d, 1" \
		--account="0x7dd16433bf7cdb21c62ddc690bffad534264fda4b75d3be011f53bea04e58e10, 1" \
		--account="0x9bd8587a4bbcaa17ae30e9a9c83dc3275612dad8a5c0eaf661ba9e54534550bb, 1" \
		--account="0x1e644bb7fe8d47057b06c11b3f3f001dd010a8e5e03bb96f1aa9382650c0cc9c, 1" \
		--account="0x1c9eb8c79d487a2090cc0713c1849a4ed1eebae76d85c720b6701f93b1c12442, 1" \
		--account="0x1684bbc1be83ceb5b71dd3aa26a2e32222dd3e66a9c2083c5a17a2c8f54edb59, 1"
