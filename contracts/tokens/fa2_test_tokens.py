import json
import smartpy as sp


@sp.module
def main():
    transfer_tx_type: type = sp.record(
        to_=sp.address, token_id=sp.nat, amount=sp.nat
    ).layout(("to_", ("token_id", "amount")))

    transfer_batch_type: type = sp.record(
        from_=sp.address, txs=sp.list[transfer_tx_type]
    ).layout(("from_", "txs"))

    operator_key_type: type = sp.record(
        owner=sp.address, operator=sp.address, token_id=sp.nat
    ).layout(("owner", ("operator", "token_id")))

    update_operator_action_type: type = sp.variant(
        add_operator=operator_key_type, remove_operator=operator_key_type
    )

    balance_of_request_type: type = sp.record(
        owner=sp.address, token_id=sp.nat
    ).layout(("owner", "token_id"))

    balance_of_response_type: type = sp.record(
        request=balance_of_request_type, balance=sp.nat
    ).layout(("request", "balance"))

    balance_of_args: type = sp.record(
        requests=sp.list[balance_of_request_type],
        callback=sp.contract[sp.list[balance_of_response_type]],
    ).layout(("requests", "callback"))

    token_metadata_value_type: type = sp.record(
        token_id=sp.nat, token_info=sp.map[sp.string, sp.bytes]
    ).layout(("token_id", "token_info"))

    mint_tokens_item_type: type = sp.record(
        token_id=sp.nat, to_=sp.address, amount=sp.nat
    ).layout(("token_id", ("to_", "amount")))

    burn_tokens_item_type: type = sp.record(
        token_id=sp.nat, from_=sp.address, amount=sp.nat
    ).layout(("token_id", ("from_", "amount")))

    create_token_item_type: type = sp.record(
        token_id=sp.nat,
        owner=sp.address,
        amount=sp.nat,
        token_info=sp.map[sp.string, sp.bytes],
    ).layout(("token_id", ("owner", ("amount", "token_info"))))

    class BakeryStyleFungibleFA2(sp.Contract):
        """FA2 fungible token profile with 12 entrypoints used by common mainnet templates."""

        def __init__(
            self,
            administrator: sp.address,
            initial_holder: sp.address,
            supply: sp.nat,
            metadata: sp.big_map[sp.string, sp.bytes],
            token_info: sp.map[sp.string, sp.bytes],
        ):
            self.data.admin = administrator
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])
            self.data.paused = False
            self.data.metadata = metadata
            self.data.ledger = sp.cast(
                sp.big_map({(initial_holder, sp.nat(0)): supply}),
                sp.big_map[sp.pair[sp.address, sp.nat], sp.nat],
            )
            self.data.operators = sp.cast(
                sp.big_map(), sp.big_map[operator_key_type, sp.unit]
            )
            self.data.token_metadata = sp.cast(
                sp.big_map(
                    {
                        sp.nat(0): sp.record(token_id=sp.nat(0), token_info=token_info)
                    }
                ),
                sp.big_map[sp.nat, token_metadata_value_type],
            )
            self.data.token_total_supply = sp.cast(
                sp.big_map({sp.nat(0): supply}), sp.big_map[sp.nat, sp.nat]
            )
            self.data.next_token_id = sp.nat(1)

        @sp.entrypoint
        def transfer(self, batch):
            sp.cast(batch, sp.list[transfer_batch_type])
            assert not self.data.paused, "PAUSED"

            for transfer in batch:
                for tx in transfer.txs:
                    assert tx.token_id in self.data.token_metadata, "FA2_TOKEN_UNDEFINED"
                    operator_key = sp.record(
                        owner=transfer.from_, operator=sp.sender, token_id=tx.token_id
                    )
                    assert transfer.from_ == sp.sender or (
                        operator_key in self.data.operators
                    ), "FA2_NOT_OPERATOR"

                    from_key = (transfer.from_, tx.token_id)
                    to_key = (tx.to_, tx.token_id)
                    self.data.ledger[from_key] = sp.as_nat(
                        self.data.ledger.get(from_key, default=0) - tx.amount,
                        error="FA2_INSUFFICIENT_BALANCE",
                    )
                    self.data.ledger[to_key] = (
                        self.data.ledger.get(to_key, default=0) + tx.amount
                    )

        @sp.entrypoint
        def update_operators(self, actions):
            sp.cast(actions, sp.list[update_operator_action_type])
            assert not self.data.paused, "PAUSED"

            for action in actions:
                match action:
                    case add_operator(operator):
                        assert operator.owner == sp.sender, "FA2_NOT_OWNER"
                        assert (
                            operator.token_id in self.data.token_metadata
                        ), "FA2_TOKEN_UNDEFINED"
                        self.data.operators[operator] = ()
                    case remove_operator(operator):
                        assert operator.owner == sp.sender, "FA2_NOT_OWNER"
                        assert (
                            operator.token_id in self.data.token_metadata
                        ), "FA2_TOKEN_UNDEFINED"
                        del self.data.operators[operator]

        @sp.entrypoint
        def balance_of(self, param):
            sp.cast(param, balance_of_args)
            balances = []
            for req in param.requests:
                assert req.token_id in self.data.token_metadata, "FA2_TOKEN_UNDEFINED"
                balances.push(
                    sp.record(
                        request=sp.record(owner=req.owner, token_id=req.token_id),
                        balance=self.data.ledger.get((req.owner, req.token_id), default=0),
                    )
                )
            sp.transfer(reversed(balances), sp.mutez(0), param.callback)

        @sp.entrypoint
        def mint_tokens(self, mints):
            sp.cast(mints, sp.list[mint_tokens_item_type])
            assert sp.sender == self.data.admin, "NOT_AN_ADMIN"

            for mint_item in mints:
                assert (
                    mint_item.token_id in self.data.token_metadata
                ), "FA2_TOKEN_UNDEFINED"
                self.data.token_total_supply[mint_item.token_id] = (
                    self.data.token_total_supply.get(mint_item.token_id, default=0)
                    + mint_item.amount
                )
                key = (mint_item.to_, mint_item.token_id)
                self.data.ledger[key] = self.data.ledger.get(key, default=0) + mint_item.amount

        @sp.entrypoint
        def burn_tokens(self, burns):
            sp.cast(burns, sp.list[burn_tokens_item_type])
            assert sp.sender == self.data.admin, "NOT_AN_ADMIN"

            for burn_item in burns:
                assert (
                    burn_item.token_id in self.data.token_metadata
                ), "FA2_TOKEN_UNDEFINED"
                key = (burn_item.from_, burn_item.token_id)
                self.data.ledger[key] = sp.as_nat(
                    self.data.ledger.get(key, default=0) - burn_item.amount,
                    error="FA2_INSUFFICIENT_BALANCE",
                )
                self.data.token_total_supply[burn_item.token_id] = sp.as_nat(
                    self.data.token_total_supply.get(burn_item.token_id, default=0)
                    - burn_item.amount,
                    error="FA2_INSUFFICIENT_BALANCE",
                )

        @sp.entrypoint
        def create_token(self, create_items):
            sp.cast(create_items, sp.list[create_token_item_type])
            assert sp.sender == self.data.admin, "NOT_AN_ADMIN"

            for create_item in create_items:
                assert create_item.token_id == self.data.next_token_id, "FA2_BAD_TOKEN_ID"
                assert not (create_item.token_id in self.data.token_metadata), "FA2_DUP_TOKEN_ID"

                self.data.token_metadata[create_item.token_id] = sp.record(
                    token_id=create_item.token_id,
                    token_info=create_item.token_info,
                )
                self.data.token_total_supply[create_item.token_id] = create_item.amount
                self.data.ledger[(create_item.owner, create_item.token_id)] = create_item.amount
                self.data.next_token_id += 1

        @sp.entrypoint
        def set_admin(self, new_admin):
            sp.cast(new_admin, sp.address)
            assert sp.sender == self.data.admin, "NOT_AN_ADMIN"
            self.data.pending_admin = sp.Some(new_admin)

        @sp.entrypoint
        def confirm_admin(self):
            pending = self.data.pending_admin
            assert pending.is_some(), "NO_PENDING_ADMIN"
            assert pending.unwrap_some() == sp.sender, "NOT_A_PENDING_ADMIN"
            self.data.admin = sp.sender
            self.data.pending_admin = sp.cast(None, sp.option[sp.address])

        @sp.entrypoint
        def pause(self, paused):
            sp.cast(paused, sp.bool)
            assert sp.sender == self.data.admin, "NOT_AN_ADMIN"
            self.data.paused = paused

        @sp.entrypoint
        def admin(self):
            assert sp.sender == self.data.admin, "NOT_AN_ADMIN"

        @sp.entrypoint
        def assets(self):
            assert sp.sender == self.data.admin, "NOT_AN_ADMIN"

        @sp.entrypoint
        def tokens(self):
            assert sp.sender == self.data.admin, "NOT_AN_ADMIN"

        @sp.offchain_view
        def all_tokens(self):
            return range(0, self.data.next_token_id)

        @sp.offchain_view
        def get_balance(self, params):
            sp.cast(params, balance_of_request_type)
            assert params.token_id in self.data.token_metadata, "FA2_TOKEN_UNDEFINED"
            return self.data.ledger.get((params.owner, params.token_id), default=0)

        @sp.offchain_view
        def total_supply(self, token_id):
            sp.cast(token_id, sp.nat)
            assert token_id in self.data.token_metadata, "FA2_TOKEN_UNDEFINED"
            return self.data.token_total_supply.get(token_id, default=0)

        @sp.offchain_view
        def is_operator(self, params):
            sp.cast(params, operator_key_type)
            assert params.token_id in self.data.token_metadata, "FA2_TOKEN_UNDEFINED"
            return params in self.data.operators

        @sp.offchain_view
        def token_metadata_view(self, token_id):
            sp.cast(token_id, sp.nat)
            assert token_id in self.data.token_metadata, "FA2_TOKEN_UNDEFINED"
            return self.data.token_metadata[token_id]


def text_bytes(value: str) -> sp.bytes:
    return sp.scenario_utils.bytes_of_string(value)


def make_token_info(name: str, symbol: str, decimals: int, value_tier: str):
    return sp.map(
        l={
            "name": text_bytes(name),
            "symbol": text_bytes(symbol),
            "decimals": text_bytes(str(decimals)),
            "value_tier": text_bytes(value_tier),
        }
    )


def make_contract_metadata(
    name: str, symbol: str, decimals: int, supply: int, value_tier: str
):
    metadata_payload = json.dumps(
        {
            "name": name,
            "description": "FA2 fungible test token with Bakery-style admin entrypoints for shadownet.",
            "symbol": symbol,
            "decimals": str(decimals),
            "supply": str(supply),
            "value_tier": value_tier,
            "interfaces": ["TZIP-012", "TZIP-016"],
        },
        separators=(",", ":"),
    )
    return sp.big_map(
        {
            "": text_bytes("tezos-storage:content"),
            "content": text_bytes(metadata_payload),
        }
    )


PLACEHOLDER_DEPLOYER = sp.address("tz1burnburnburnburnburnburnburjAYjjX")

TOKENS = [
    {
        "target": "test_bronze",
        "name": "Test Bronze",
        "symbol": "TBRNZ",
        "decimals": 8,
        "supply": 100_000_000,
        "value_tier": "bronze=0.1 silver",
    },
    {
        "target": "test_silver",
        "name": "Test Silver",
        "symbol": "TSLVR",
        "decimals": 7,
        "supply": 10_000_000,
        "value_tier": "silver=0.1 gold",
    },
    {
        "target": "test_gold",
        "name": "Test Gold",
        "symbol": "TGOLD",
        "decimals": 6,
        "supply": 1_000_000,
        "value_tier": "gold=0.1 platinum",
    },
    {
        "target": "test_platinum",
        "name": "Test Platinum",
        "symbol": "TPLAT",
        "decimals": 5,
        "supply": 100_000,
        "value_tier": "platinum=0.1 diamond",
    },
    {
        "target": "test_diamond",
        "name": "Test Diamond",
        "symbol": "TDIAM",
        "decimals": 4,
        "supply": 10_000,
        "value_tier": "diamond=top tier",
    },
]


def build_token_contract(token):
    return main.BakeryStyleFungibleFA2(
        administrator=PLACEHOLDER_DEPLOYER,
        initial_holder=PLACEHOLDER_DEPLOYER,
        supply=sp.nat(token["supply"]),
        metadata=make_contract_metadata(
            name=token["name"],
            symbol=token["symbol"],
            decimals=token["decimals"],
            supply=token["supply"],
            value_tier=token["value_tier"],
        ),
        token_info=make_token_info(
            name=token["name"],
            symbol=token["symbol"],
            decimals=token["decimals"],
            value_tier=token["value_tier"],
        ),
    )


if "main" in __name__:

    @sp.add_test()
    def test_bronze():
        scenario = sp.test_scenario("test_bronze")
        scenario += build_token_contract(TOKENS[0])

    @sp.add_test()
    def test_silver():
        scenario = sp.test_scenario("test_silver")
        scenario += build_token_contract(TOKENS[1])

    @sp.add_test()
    def test_gold():
        scenario = sp.test_scenario("test_gold")
        scenario += build_token_contract(TOKENS[2])

    @sp.add_test()
    def test_platinum():
        scenario = sp.test_scenario("test_platinum")
        scenario += build_token_contract(TOKENS[3])

    @sp.add_test()
    def test_diamond():
        scenario = sp.test_scenario("test_diamond")
        scenario += build_token_contract(TOKENS[4])
