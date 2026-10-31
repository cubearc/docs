"""Project reviewed Core examples and exact contracts, without a second registry."""
import argparse
import hashlib
import json
import re
from pathlib import Path


def write_details(catalog_json, fixtures, identities, destination):
    catalog = json.loads(catalog_json)
    catalog_sha256 = hashlib.sha256(catalog_json.strip().encode()).hexdigest()
    contracts = {row['operation']: row for row in catalog['operations']}
    answers = {row['operation']: row for row in fixtures}
    hashes = {row['operation']: row for row in identities}
    if len(contracts) != len(catalog['operations']) or len(answers) != len(fixtures) or len(hashes) != len(identities):
        raise ValueError('Duplicate operation identity in tool detail sources.')
    if contracts.keys() != answers.keys() or contracts.keys() != hashes.keys():
        raise ValueError('Tool detail sources must cover exactly the runtime catalog.')
    projected = {}
    for operation, contract in contracts.items():
        fixture, identity = answers[operation], hashes[operation]
        version = contract['operation_version']
        if not re.fullmatch(r'[a-z0-9_.]+', operation):
            raise ValueError('Unsafe operation asset name.')
        if fixture['operation_version'] != version or identity['operation_version'] != version or fixture['contract_sha256'] != identity['contract_sha256']:
            raise ValueError(f'Stale reviewed example or contract: {operation}')
        # Nested JSON stays text: JavaScript must not round schema limits or examples.
        projected[operation] = {
            'operation': operation, 'operation_version': version,
            'contract_sha256': identity['contract_sha256'], 'catalog_sha256': catalog_sha256,
            'contract_json': json.dumps(contract, ensure_ascii=False, indent=2),
            'example': {field: {name: value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) for name, value in fixture[field].items()}
                        for field in ('inputs', 'parameters', 'outputs')},
        }
    destination.mkdir(parents=True, exist_ok=True)
    for operation, detail in projected.items():
        (destination / f'{operation}.json').write_text(json.dumps(detail, ensure_ascii=False) + '\n')


def main():
    parser = argparse.ArgumentParser()
    for name in ('catalog', 'fixtures', 'identities', 'output'):
        parser.add_argument(f'--{name}', type=Path, required=True)
    args = parser.parse_args()
    write_details(args.catalog.read_text(), json.loads(args.fixtures.read_text()),
                  json.loads(args.identities.read_text()), args.output)


if __name__ == '__main__':
    main()
