module.exports = {
  apps: [
    {
      name: "payport-event-engine",
      script: "npx",
      args: "tsx src/index.ts",
      cwd: "/home/ec2-user/Payport-event-engine",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_file: ".env",
      instances: 1, // Single instance for SSE (stateful sessions)
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "500M",
      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      log_file: "./logs/combined.log",
      time: true,
      // Restart settings
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ]
};

