"""Exercise hidden interactive owner creation only against the disposable cluster."""
import os
import pty
import select
import subprocess
import time
import uuid


def bootstrap(api, env):
    master, slave=pty.openpty()
    secret=uuid.uuid4().hex
    process=subprocess.Popen(['node',str(api/'scripts/create-admin.js')],stdin=slave,stdout=slave,stderr=slave,env=env)
    os.close(slave)
    steps=[(b'Owner email: ',b'bootstrap@example.test\n'),
           (b'Display name: ',b'Bootstrap Test\n'),
           ('Password (hidden, 12–128 characters): '.encode(),secret.encode()+b'\r'),
           (b'Repeat password (hidden): ',secret.encode()+b'\r')]
    output=b'';index=0;deadline=time.monotonic()+15
    try:
        while time.monotonic()<deadline:
            readable,_,_=select.select([master],[],[],0.1)
            if readable:
                try:chunk=os.read(master,4096)
                except OSError:break
                if not chunk:break
                output+=chunk
                if index<len(steps) and steps[index][0] in output:
                    os.write(master,steps[index][1]);index+=1
            if process.poll() is not None and not readable:break
        if process.poll() is None:
            process.kill()
            raise AssertionError('Interactive owner bootstrap stalled at prompt '+str(index)+' (output suppressed)')
        assert process.wait()==0,'Interactive owner bootstrap failed (output suppressed)'
        assert b'Initial owner created.' in output,'Owner bootstrap success missing'
        assert secret.encode() not in output,'Hidden password was echoed'
        print('PASS: interactive initial owner bootstrap completed without echoing its password.')
    finally:
        if process.poll() is None:process.kill();process.wait()
        os.close(master)
