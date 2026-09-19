# eDin+ Gateway Control

A web-based control interface for eDin+ Gateway devices. This application provides a user-friendly interface for configuring and controlling eDin+ Gateway systems, including keypad configuration, channel control, DALI management, and area/scene control.

## Features

- Gateway Setup and Configuration
- Keypad Configuration and Control
- Channel Fade Control
- DALI Device Management
- Area and Scene Management
- Real-time Command Testing

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd edinplus-gateway-control
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
npm start
```

## Tests

Gateway parsing and Control helpers are covered by Node's built-in test runner:

```bash
npm test
```

## Gateway protocol

Working reference for ASCII commands, scene events, and what this app implements:

- [docs/gateway-interface.md](docs/gateway-interface.md)
- Official PDFs in `GatewayPDFs/`
- Long command list: `gateway_readme.md`

## Development

This project uses:
- HTML5 for structure
- CSS3 for styling
- JavaScript for functionality
- Electron for desktop application packaging

## License

[License Type] - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request 