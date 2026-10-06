# Synthetic TLS test fixture

These certificates and private key are public, disposable test data, generated
only for the local PostgreSQL protocol fixture. They authorize no AWS account
or real database and must never be used by the application or production.

The server certificate identifies `test.sa-east-1.rds.amazonaws.com`; tests bind
only to local loopback and verify the original name through a simulated tunnel.
The CA signing private key was discarded. No OpenSSL runtime is required.
