pipeline {
    agent { dockerfile true }
    stages {
        stage('Setup') {
            steps {
                sh 'npm install --cache /tmp/empty-cache'
            }
        }
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
    }
}
