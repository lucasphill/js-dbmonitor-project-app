# Certificados CA do Amazon RDS

`rds-global-bundle.pem` foi obtido em 2026-09-23 da [trust store oficial do Amazon RDS](https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem). O arquivo contém 108 certificados PEM e tem SHA-256 `E5BB2084CCF45087BDA1C9BFFDEA0EB15EE67F0B91646106E466714F9DE3C7E3` nesta revisão.

O processo principal entrega este bundle ao cliente PostgreSQL com `rejectUnauthorized: true` e `servername` igual ao endpoint RDS configurado. Um certificado expirado, cadeia não confiável ou nome divergente deve impedir a conexão. Não substituir por `rejectUnauthorized: false`.

Para atualizar, baixe novamente a URL oficial, revise a [documentação de rotação de certificados RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html), valide que é um conjunto de certificados PEM, registre data, quantidade e SHA-256 aqui, e execute os testes TLS antes de distribuir o aplicativo.
