FROM iskendy-local-spike:mac-20261008
COPY --chown=65532:65532 reference /reference-current
COPY dist /current-dist
COPY local-backend-spike.py /test/current-backend-spike.py
ENTRYPOINT ["python", "/test/current-backend-spike.py", "--backend", "/reference-current", "--dist", "/current-dist", "--port", "8099", "--container-listen"]
