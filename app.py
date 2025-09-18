from flask import Flask
from routes.auth_routes import auth_bp
from routes.dashboard_routes import dashboard_bp
from routes.usuarios_routes import usuarios_bp
from routes.fornecedores_routes import fornecedores_bp
from routes.materiais_routes import materiais_bp
from routes.produtos_routes import produtos_bp
from routes.saida_nf_routes import saida_nf_bp
from routes.entrada_nf_route import entrada_nf_bp
from routes.calculo_nfs_route import calculo_bp

app = Flask(__name__)
app.secret_key = 'segredo'  # Necessário para flash e sessão

# Registrando Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(usuarios_bp)
app.register_blueprint(fornecedores_bp)
app.register_blueprint(materiais_bp)
app.register_blueprint(produtos_bp)
app.register_blueprint(saida_nf_bp)
app.register_blueprint(entrada_nf_bp)
app.register_blueprint(calculo_bp)


if __name__ == '__main__':
    app.run(debug=True)