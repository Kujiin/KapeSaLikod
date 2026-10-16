#!/usr/bin/env python3
"""Run as local postgres; write an exclusive, private dump outside the repository."""
import argparse
import os
from pathlib import Path
import subprocess

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('destination',type=Path)
args=parser.parse_args()
path=args.destination
repo=Path(__file__).resolve().parents[3]
if not path.is_absolute() or path.resolve().is_relative_to(repo):
    parser.error('Choose an absolute backup path outside the checkout.')
if not path.parent.is_dir():
    parser.error('Create the private backup directory first.')
env={k:v for k,v in os.environ.items() if not k.startswith('PG')}
try:
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
except FileExistsError:
    parser.error('Backup already exists; refusing overwrite.')
try:
    with os.fdopen(fd,'wb') as output:
        subprocess.run(['pg_dump','--no-password','--host=/var/run/postgresql','--port=5432',
                        '--username=postgres','--dbname=kape_sa_likod','--format=custom','--no-owner'],
                       env=env,stdout=output,check=True)
    print('Private backup completed. Copy it to protected off-server storage.')
except BaseException:
    path.unlink(missing_ok=True)
    raise
