import psycopg2
import os
from dotenv import load_dotenv

# Carrega as variáveis do .env
load_dotenv()

def conectar():
    try:
        conexao = psycopg2.connect(
            host=os.getenv("DB_HOST"),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            port=os.getenv("DB_PORT")
        )
        return conexao
    except Exception as e:
        print("Erro ao conectar ao banco:", e)
        return None