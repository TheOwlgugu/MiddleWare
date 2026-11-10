-- 设备在线状态日志：只在上线/下线时追加一行
-- work 最后一位是 9 表示离线（0009），其余为工作模式
CREATE TABLE IF NOT EXISTS device_status_log (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id   INT NOT NULL,
  work        CHAR(4) NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_device_time (device_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
