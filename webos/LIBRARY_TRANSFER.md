# Transferência de biblioteca (0.37)

Port de `data/repository/LibraryTransfer.kt` + `LibraryTransferService.kt` +
`ui/screens/settings/LibraryTransferFlow.kt`. **Ajustes → Conta → Transferência de
biblioteca**.

O fluxo é o do fork, em três passos: **origem** → **destino** → **revisão**. A revisão é um
*dry-run*: ela decide **o que** seria escrito e mostra os números antes de qualquer gravação.
Só então **Copiar agora** ou **Mover agora** aparecem.

## As duas origens/destinos desta TV

| | O que é |
|---|---|
| **Biblioteca desta TV** | `state.library` (favoritos locais + o que já veio da conta) |
| **Conta Nuvio** | o retrato da biblioteca da conta, lido na hora pela API |

Trakt, Simkl e MDBList **não** aparecem como origem/destino: o login desses serviços acontece
no app Android, e a leitura do MDBList ainda é pendente (ver [MDBLIST_TRACKING.md](MDBLIST_TRACKING.md)).
A tela diz isso, em vez de oferecer um destino que não funcionaria.

## As regras do plano (as do fork, uma a uma)

- **Uma identidade canônica** para comparar: IMDb quando existe, senão `tmdb:{n}`.
- **Sem IMDb/TMDB** a entrada é contada como `sem id` e **não** é escrita — o destino não
  saberia resolvê-la.
- **Duplicadas na origem** entram uma vez só.
- **Já presentes no destino** são ignoradas.
- **Mover** é copiar e depois remover na origem, e só remove **o que foi escrito**: o que foi
  ignorado continua onde estava.
- Copiar para a **conta** entra na fila de envio do Nuvio (o mesmo outbox de sempre), e a
  sincronização é disparada ao final; nada é escrito na nuvem sem passar por essa fila.

## Limites

- A transferência é entre **duas** bibliotecas (a da TV e a da conta). Não há arquivo de
  exportação/importação: o port não tem, hoje, um local comprovadamente alcançável pelo usuário
  para gravar e reler esse arquivo na TV, e não vai prometer um arquivo que ninguém consegue pegar.
- Progresso, assistidos e coleções **não** são transferidos; o fork transfere a biblioteca (favoritos).
- A revisão lê a conta na hora: sem rede, ela falha com o motivo e nada é escrito.

## Testes

`tests/library-transfer.test.mjs` (5 testes): a identidade canônica, o plano com dedup/já
presente/sem id/duplicada, o plano vazio que diz “nada a escrever”, o “mover” que só remove o
que foi escrito e o formato das entradas que chegam à biblioteca.
