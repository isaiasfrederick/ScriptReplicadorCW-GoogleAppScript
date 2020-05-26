var script = "appscript";

var fs = null;
var XMLHttpRequest = null;

var carteirasSS = [];
var carteiraPrincipalSS = "";
var apelidoScript = "App Script (js) / API Infinite Pay";
var usuarioBanco = "";
var senhaBanco = "";

// Arquivo do Google Drive que registra a ID da última página salva
var diretorioArquivo = "UltimasPaginasSalvas.json";
// Arquivo salvo. É diferente de null se existe
var arquivoSalvo = null;
var totalPaginasExistentes = 0;

var connStrGlobal = "jdbc:google:mysql://<server>:<db>";
var dirBaseTransacoes = "";
var dirBasePaginas = "";
var urlBaseTransacoes = "https://api.infinitepay.io/v1/transactions/";

if (script != "appscript") {
  fs = require("fs");
  XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
}

var headers = {
  Authorization: "<app_key>",
};

function lerArquivoEstado() {
  arquivos = DriveApp.getFilesByName(diretorioArquivo);
  estadoSalvo = null;
  if (arquivos != null) {
    while (arquivos.hasNext()) {
      var cfg = arquivos.next();
      return JSON.parse(cfg.getBlob().getDataAsString())
    }
  }
  return null;
}

function escreverArquivo(qtdePaginasLidas, indiceUltimaTransacao) {
  arquivoSalvo = {
    "totalPaginasUltimaLeitura": qtdePaginasLidas,
    "indiceUltimaTransacao": indiceUltimaTransacao
  };
  DriveApp.createFile(diretorioArquivo, JSON.stringify(arquivoSalvo), MimeType.PLAIN_TEXT);
}

function log(e) {
  if (script == "appscript") {
    Logger.log(e);
  } else {
    console.log(e);
  }
}

/* Descobre a ultima pagina e a le */
function lerUltimaPagina() {}

function arquivoExiste(dir) {
  return false;
}

function gerarInsert(tabela, objeto) {
  return "";
}

function consultarMDR(bandeira, operacao) {
  return "";
}

function salvarRegistro(comandoSQL) {
  if (script == "appscript") {
    var connStr = connStrGlobal;
    var conn = Jdbc.getCloudSqlConnection(connStr, usuarioBanco, senhaBanco);

    var stmt = conn.prepareStatement(comandoSQL);
    stmt.execute();
  }
}

function construirInsert(parametros, tabela) {
  colunas = "";
  valores = "";

  Object.keys(parametros).forEach(function (chave) {
    valor = parametros[chave];
    colunas += String(chave) + ", ";

    if (chave != "split_regra_texto_json") {
      valores += "'" + String(valor).replace('"', "'") + "', ";
    } else {
      valor = JSON.parse(valor);
      valor = JSON.stringify(valor);
      valores += "'" + valor + "', ";
    }
  });

  colunas = colunas.substring(0, colunas.length - 2);
  valores = valores.substring(0, valores.length - 2);

  return `INSERT INTO ${tabela}(${colunas}) VALUES(${valores});`;
}

function carregarUltimasPaginas() {
  var urlPaginas = "https://api.infinitepay.io/v1/transactions?page=";
  res = httpGet(urlPaginas + 1);
  
  if (res["code"] == 200) {
    // Páginas retornadas pela API
    totalPaginasExistentes = JSON.parse(res["content"])["pagination"]["total_pages"];

    estadoPaginas = lerArquivoEstado();
    totalPaginasSalvas = null;

    // Total de páginas salvas    
    if (estadoPaginas == null) {
      totalPaginasSalvas = 0;
    } else {
      totalPaginasSalvas = estadoPaginas["totalPaginasUltimaLeitura"];
    }
    
    totalPaginasNaoSalvas = totalPaginasExistentes - totalPaginasSalvas;
    
    if (totalPaginasNaoSalvas == 0)
      totalPaginasNaoSalvas = totalPaginasNaoSalvas + 1;
    
    paginaCorrente = 1;
    paginasNaoPersistidas = []
    
    while (paginaCorrente <= totalPaginasNaoSalvas) {
      res = httpGet(urlPaginas + paginaCorrente);
      log(urlPaginas + paginaCorrente);
      
      if (res["code"] == 200) {
        paginasNaoPersistidas.push(JSON.parse(res["content"]));
      }
      
      paginaCorrente = paginaCorrente + 1;
    }
    
    return paginasNaoPersistidas;
    
  }

  return [];
}

function converterMontante(valor) {
  if (Number.isInteger(valor) == false) {
    valor = String(valor);
    if (valor.split(".")[1].length == 1) {
      return String(valor + "0").replace(".", "");
    } else if (valor.split(".")[1].length == 2) {
      return String(parseInt(valor.replace(".", "")));
    }
  } else if (Number.isInteger(valor)) {
    return String(valor) + "00";
  }
}

function httpGet(url) {
  if (script != "appscript") {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", url, false); // false for synchronous request
    xmlHttp.setRequestHeader(
      "Authorization",
      "xx0pmTTBXwjvUxfCQ0t2cEzdsIakGZYF"
    );
    xmlHttp.send(null);
    return { code: xmlHttp.status, content: xmlHttp.responseText };
  } else {
    var options = {
      method: "get",
      headers: headers,
    };

    response = UrlFetchApp.fetch(url, options);

    return {
      code: response.getResponseCode(),
      content: response.getContentText(),
    };
  }
}

function retornarRegraSplit(objetoTransacao) {
  splitPayment_bruto = [];
  splitPayment = [];

  for (indice = 0; indice < objetoTransacao["installments"].length; indice++) {
    if ("splitPayment" in objetoTransacao["installments"][indice]) {
      reg = objetoTransacao["installments"][indice];

      reg["splitPayment"].forEach(function (item, index) {
        splitPayment.push(item);
        splitPayment_bruto.push(item);
      });
    }
  }

  // Chave so Split
  chaves = ["id_cupom", "amount", "wallet_id", "chargeable", "id_cupom"];

  objSaida = {};

  splitPayment.forEach((reg, index) => {
    if ("id_cupom" in reg) {
      objSaida["saque_cupom_id"] = reg["id_cupom"];
    } else {
      objSaida["saque_cupom_id"] = "";
    }

    if ("number" == typeof reg["amount"]) {
      mdrCarteiraCentavos = "mdr_fee" in reg ? reg["mdr_fee"] : 0;
      reg["amount"] = converterMontante(reg["amount"] + mdrCarteiraCentavos);
    }
  });

  indice = 0;
  while (indice < splitPayment.length) {
    regTmp = Object.entries(splitPayment[indice]);
    splitPayment[indice] = {};

    regTmp.forEach((reg, index) => {
      k = reg[0];
      v = reg[1];

      if (chaves.includes(k)) {
        splitPayment[indice][k] = v;
      }
    });

    indice += 1;
  }

  if (splitPayment.length > 0) {
    objSaida["split_wallet_id1"] = splitPayment[0]["wallet_id"];
    objSaida["split_wallet_id1_chargeable"] = splitPayment[0]["chargeable"];
    objSaida["split_wallet_id1_montante"] = splitPayment[0]["amount"];

    if (splitPayment.length > 1) {
      objSaida["split_wallet_id2"] = splitPayment[1]["wallet_id"];
      objSaida["split_wallet_id2_chargeable"] = splitPayment[1]["chargeable"];
      objSaida["split_wallet_id2_montante"] = splitPayment[1]["amount"];
    } else {
      objSaida["split_wallet_id2"] = "";
      objSaida["split_wallet_id2_chargeable"] = "";
      objSaida["split_wallet_id2_montante"] = "";
    }
  }

  objSaida["split_regra_texto_json"] = JSON.stringify(splitPayment_bruto);

  return objSaida;
}

function construirObjeto() {
  ultimaPagina["results"].forEach((regTrns, valor) => {
    transacaoID = regTrns["transaction_id"];
    dirArqTransacao =
      urlBaseTransacoes + "Transacao-" + transacaoID + ".json";

    if (arquivoExiste(dirArqTransacao) == false) {
      if (true) {
        urlTransacaoID = urlBaseTransacoes + "" + transacaoID;
        saida = httpGet(urlTransacaoID);
      } else {
        saida = {
          code: 200,
          content: JSON.stringify(
            require(dirBaseTransacoes + "Transacao-" + transacaoID + ".json")
          ),
        };
      }

      if (saida["code"] == 200) {
        objTransacaoBaixado = saida["content"];

        trns = JSON.parse(objTransacaoBaixado);
        regBD = {};

        regBD["id_registro"] = String(regTrns["transaction_id"]);
        regBD["serial_number"] = String(regTrns["serial_number"]);
        regBD["status_consulta"] = "";

        // Data tr_
        regBD["tr_id"] = String(regTrns["transaction_id"]);
        regBD["tr_status"] = String(regTrns["status"]);
        regBD["tr_tipo"] = String(trns["payment_method"]);
        regBD["tr_codigo_retorno"] = "";
        regBD["tr_metodo_captura"] = String(trns["capture_method"]);

        regBD["saque_cupom_id"] = "";

        // Multiplicação por 100 de um numero 'amount'
        amount_str = String(regTrns["amount"]);

        if (amount_str.includes(".")) {
          if (amount_str.split(".")[1].length) {
            regBD["tr_montante"] = parseInt(amount_str.replace(".", "") + "0");
          } else {
            regBD["tr_montante"] = parseInt(amount_str.replace(".", ""));
          }
        } else {
          regBD["tr_montante"] = parseInt(String(amount_str + "00"));
        }

        regBD["tr_status"] = String(regTrns["status"]);
        regBD["tr_data_inicio"] = String(regTrns["created_at"]);
        regBD["tr_data_fim"] = String(regTrns["created_at"]);
        regBD["tr_data_inicio_autorizacao"] = String(regTrns["created_at"]);
        regBD["tr_data_fim_autorizacao"] = String(regTrns["created_at"]);

        try {
          regBD["merchant_name"] = trns["merchant"]["name"];
        } catch (e) {
          regBD["merchant_name"] = "";
        }

        try {
          regBD["merchant_wallet"] = trns["merchant"]["wallet_id"];
        } catch (e) {
          regBD["merchant_wallet"] = "";
        }

        try {
          regBD["merchant_number"] = trns["merchant"]["document_number"];
        } catch (e) {
          regBD["merchant_number"] = "";
        }

        // Cartao
        regBD["cartao_titular"] = String(regTrns["card_holder_name"]);
        regBD["cartao_bandeira"] = String(regTrns["card_brand"]);
        regBD["cartao_primeiros_digitos"] = String(
          regTrns["card_number"].substring(0, 6)
        );
        regBD["cartao_ultimos_digitos"] = String(
          regTrns["card_number"].substring(regTrns["card_number"].length - 4)
        );
        regBD["cartao_data_expiracao"] = "";

        // MDRs
        cb = regBD["cartao_bandeira"];
        regBD["percentagem_mdr"] = trns["mdr"];

        // Valor Saque
        regBD["saque_valor"] = String(regBD["tr_montante"])
          .charAt(0)
          .concat(
            Array(String(regBD["tr_montante"]).length - 1)
              .fill("0")
              .join("")
          );
        regBD["saque_taxa"] = String(
          parseInt(regBD["tr_montante"]) - parseInt(regBD["saque_valor"])
        );

        // Split pagamento
        regBD["split_wallet_id1"] = "";
        regBD["split_wallet_id2"] = "";
        regBD["split_wallet_id1_chargeable"] = "";
        regBD["split_wallet_id2_chargeable"] = "";
        regBD["split_wallet_id1_montante"] = "";
        regBD["split_wallet_id2_montante"] = "";
        regBD["split_regra_texto_json"] = "";

        // Origem registro
        regBD["origem_registro"] = apelidoScript;

        obj_split = retornarRegraSplit(trns);

        Object.entries(obj_split).forEach(([k, valor_iter]) => {
          if ("split_regra_texto_json" == k) {
            regBD[k] = obj_split[k];
            //regBD[k] = JSON.stringify(obj_split[k]);
          } else {
            regBD[k] = obj_split[k];
          }
        });

        condicao1 = false;
        condicao2 = false;
        condicao3 = false;
        condicao4 = false;

        if (regBD["split_wallet_id2"] in carteirasSS) {
          if (regBD["split_wallet_id2_chargeable"] in [False, "False"]) {
            condicao1 = true;
          }
        }

        if (regBD["split_wallet_id1_chargeable"] in [true, "True"]) {
          if (regBD["split_wallet_id2_chargeable"] in [true, "True"]) {
            if (regBD["split_wallet_id2"] in carteirasSS) {
              condicao2 = true;
            }
          }
        }

        if (regBD["split_wallet_id1"] in carteirasSS)
          if (regBD["split_wallet_id2"] in carteirasSS)
            if (regBD["split_wallet_id1_chargeable"] in [true, "True"])
              if (regBD["split_wallet_id1"] == carteiraPrincipalSS)
                condicao3 = true;

        if (regBD["split_wallet_id1"] in carteirasSS)
          if (regBD["split_wallet_id2"] in carteirasSS)
            if (regBD["split_wallet_id1_chargeable"] in [true, "True"])
              if (regBD["split_wallet_id1"] == carteiraPrincipalSS)
                condicao3 = true;

        if (regBD["split_wallet_id1"] in carteirasSS)
          if (regBD["split_wallet_id1_chargeable"] in [true, "True"])
            if (regBD["split_wallet_id2_montante"] == "") condicao4 = true;
            else {
              if (
                int(regBD["split_wallet_id2_montante"]) <
                int(regBD["split_wallet_id1_montante"])
              )
                condicao4 = true;
            }
    
        if (
          condicao1 == true ||
          condicao2 == true ||
          condicao3 == true ||
          condicao4 == true
        ) {
          wallet_tmp = regBD["split_wallet_id1"];
          chargeableTmp = regBD["split_wallet_id1_chargeable"];
          montanteTmp = regBD["split_wallet_id1_montante"];

          regBD["split_wallet_id1"] = regBD["split_wallet_id2"];
          regBD["split_wallet_id1_chargeable"] =
            regBD["split_wallet_id2_chargeable"];
          regBD["split_wallet_id1_montante"] =
            regBD["split_wallet_id2_montante"];

          regBD["split_wallet_id2"] = wallet_tmp;
          regBD["split_wallet_id2_chargeable"] = chargeableTmp;
          regBD["split_wallet_id2_montante"] = montanteTmp;
        }

        total_carteiras = JSON.parse(obj_split["split_regra_texto_json"])
          .length;

        // Se é uma mísera carteira, coloque carteira 2
        if (total_carteiras == 1) {
          if (regBD["split_wallet_id1"] != "") {
            regBD["split_wallet_id2"] = regBD["split_wallet_id1"];
            regBD["split_wallet_id2_chargeable"] =
              regBD["split_wallet_id1_chargeable"];
            regBD["split_wallet_id2_montante"] =
              regBD["split_wallet_id1_montante"];

            regBD["split_wallet_id1"] = "";
            regBD["split_wallet_id1_chargeable"] = false;
            regBD["split_wallet_id1_montante"] = "";
          }
        }
    
        if (regBD["split_wallet_id1_montante"] == "")
          regBD["split_wallet_id1_montante"] = "0";
        if (regBD["split_wallet_id2_montante"] == "")
          regBD["split_wallet_id2_montante"] = "0";

        try {
      if (parseFloat(regBD["split_walled_id2_montante"]) == 0.00) {
          wallet_tmp = regBD["split_wallet_id1"];
          chargeableTmp = regBD["split_wallet_id1_chargeable"];
          montanteTmp = regBD["split_wallet_id1_montante"];

          regBD["split_wallet_id1"] = regBD["split_wallet_id2"];
          regBD["split_wallet_id1_chargeable"] =
            regBD["split_wallet_id2_chargeable"];
          regBD["split_wallet_id1_montante"] =
            regBD["split_wallet_id2_montante"];

          regBD["split_wallet_id2"] = wallet_tmp;
          regBD["split_wallet_id2_chargeable"] = chargeableTmp;
          regBD["split_wallet_id2_montante"] = montanteTmp;
      }
    } catch(e){
    }
    
        if (regBD["tr_tipo"] == "debit") {
          if (regBD["tr_status"] == "approved") {
            somaMontante = 0;
            somaMontante += parseInt(regBD["split_wallet_id1_montante"]);
            somaMontante += parseInt(regBD["split_wallet_id2_montante"]);

            if (somaMontante == parseInt(regBD["tr_montante"])) {
              comandoSQL = construirInsert(
                regBD,
                "transacoessaquesempre.transacoes_estruturadas"
              );

              try {
                // log("Salvando o registro:\n" + comandoSQL + "\n\n");
                log(">> Salvando registro com ID: "+String(regBD['id_registro']));
                salvarRegistro(comandoSQL);
                log("@ Comando salvo! ID: "+String(regBD['id_registro']));
              } catch (e) {
                log(String(e));
              }
            }
          }
        }
      }
    }
  });
}

function iniciarAtualizacao() {
  ultimasPaginas = carregarUltimasPaginas();
  indicePagina = 0;
  
  while (indicePagina < ultimasPaginas.length) {
    ultimaPagina = ultimasPaginas[indicePagina];
    indicePagina = indicePagina + 1;
    construirObjeto();
  }
  
  // Salvando estado
  escreverArquivo(totalPaginasExistentes, 0);
  log("\n\nFim do Script...\n\n");
}
